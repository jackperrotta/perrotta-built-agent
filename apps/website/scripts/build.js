import fs from 'fs-extra';
import path from 'path';
import { JSDOM } from 'jsdom';
import chokidar from 'chokidar';
import { categories, posts } from '../src/data/mock-db.js';

const APP_DIR = path.resolve(process.cwd()); // apps/website
const SRC_DIR = path.join(APP_DIR, 'src');
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const COMPONENTS_DIR = path.join(SRC_DIR, 'components');
const LAYOUTS_DIR = path.join(SRC_DIR, 'layouts');
const PAGES_DIR = path.join(SRC_DIR, 'pages');
const STYLES_DIR = path.join(SRC_DIR, 'styles');
const SCRIPTS_DIR = path.join(SRC_DIR, 'scripts');

// Parse arguments
const isWatch = process.argv.includes('--watch');

async function build() {
    console.log('🏗️  Building Website...');
    const startTime = Date.now();

    // 1. Clean Public Dir
    await fs.emptyDir(PUBLIC_DIR);
    await fs.ensureDir(path.join(PUBLIC_DIR, 'assets'));

    // 2. Bundle Global Assets
    await bundleAssets();

    // 2.1 Copy Static Assets (Images, etc.)
    const assetsDir = path.join(SRC_DIR, 'assets');
    if (await fs.pathExists(assetsDir)) {
        await fs.copy(assetsDir, path.join(PUBLIC_DIR, 'assets'), { overwrite: true });
    }

    // 3. Process Static Pages
    await processStaticPages(PAGES_DIR);

    // 4. Generate Dynamic Routes
    await generateDynamicRoutes();

    console.log(`✅ Build completed in ${Date.now() - startTime}ms`);
}

async function bundleAssets() {
    // Bundle CSS in order: Variables -> Typography -> Global
    const variablesCss = await getFileContent(path.join(STYLES_DIR, 'variables.css'));
    const typographyCss = await getFileContent(path.join(STYLES_DIR, 'typography.css'));
    const globalCss = await getFileContent(path.join(STYLES_DIR, 'global.css'));

    // Combine them
    const combinedCss = `${variablesCss}\n${typographyCss}\n${globalCss}`;

    // Bundle JS
    const globalJsDetails = await getFileContent(path.join(SCRIPTS_DIR, 'global.js'));

    await fs.writeFile(path.join(PUBLIC_DIR, 'assets', 'style.css'), combinedCss || '');
    await fs.writeFile(path.join(PUBLIC_DIR, 'assets', 'main.js'), globalJsDetails || '');
}

async function getFileContent(filePath) {
    if (await fs.pathExists(filePath)) {
        return await fs.readFile(filePath, 'utf-8');
    }
    return '';
}

async function processStaticPages(dir) {
    const files = await fs.readdir(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
            // Skip builders-journal template folders (category/article)
            if (fullPath.includes('builders-journal') && (file === 'category' || file === 'article')) {
                continue;
            }
            await processStaticPages(fullPath);
        } else if (file.endsWith('.html')) {
            // Determine output path
            const relativePath = path.relative(PAGES_DIR, fullPath);
            const outputFilePath = path.join(PUBLIC_DIR, relativePath);
            await processPage(fullPath, outputFilePath);
        }
    }
}

async function processPage(inputPath, outputPath, context = {}) {
    let pageContent = await fs.readFile(inputPath, 'utf-8');

    // 1. Extract Metadata (Title, Layout)
    const titleMatch = pageContent.match(/<!--\s*title:\s*(.*?)\s*-->/);
    const title = context.title || (titleMatch ? titleMatch[1] : 'Perrotta Built');

    const descMatch = pageContent.match(/<!--\s*description:\s*(.*?)\s*-->/);
    const description = context.description || (descMatch ? descMatch[1] : '');

    const layoutMatch = pageContent.match(/<!--\s*layout:\s*(.*?)\s*-->/);
    const layoutName = layoutMatch ? layoutMatch[1] : 'main-layout';

    // 2. Load Layout
    const layoutPath = path.join(LAYOUTS_DIR, `${layoutName}.html`);
    let layoutHtml = await getFileContent(layoutPath);
    if (!layoutHtml) {
        console.warn(`Layout ${layoutName} not found, using raw content.`);
        layoutHtml = '{{ content }}'; // Fallback
    }

    // 3. Inject Content & Metadata
    let finalHtml = layoutHtml
        .replace('{{ title }}', title)
        .replace('{{ description }}', description)
        .replace('{{ content }}', pageContent);

    // 4. Component Parsing & Injection
    // We use JSDOM to manipulate the DOM for component injection
    const dom = new JSDOM(finalHtml);
    const document = dom.window.document;

    // Find all custom elements starting with c-
    const allElements = document.querySelectorAll('*');
    const usedComponents = new Set();

    for (const el of allElements) {
        if (el.tagName.toLowerCase().startsWith('c-')) {
            const componentName = el.tagName.toLowerCase().substring(2); // remove c-
            usedComponents.add(componentName);

            // Load Component
            const compHtmlPath = path.join(COMPONENTS_DIR, componentName, `${componentName}.html`);
            const compHtml = await getFileContent(compHtmlPath);

            if (compHtml) {
                // Basic Prop Replacement: attributes to {{ prop }}
                let injectedHtml = compHtml;
                for (const attr of el.attributes) {
                    const regex = new RegExp(`{{\\s*${attr.name}\\s*}}`, 'g');
                    injectedHtml = injectedHtml.replace(regex, attr.value);
                }

                // Replace innerHTML
                el.innerHTML = injectedHtml;
                // Unwrap? Or keep the c- tag as a wrapper? 
                // Plan said "Injects HTML". Keeping the tag acts as a wrapper which is often useful for styling.
                // Let's keep it for now, but treating it as a div via CSS.
                // Actually, browsers treat unknown tags as inline by default. We should probably force display block in global css.
            } else {
                console.warn(`Component ${componentName} not found.`);
            }
        }
    }

    // 5. Bundle Component Assets (CSS/JS)
    // We append them to the public/assets/style.css and main.js
    // NOTE: In a parallel build, this append is dangerous. We should collect all components first or write separate files.
    // For simplicity: We will Append specific imports to the generated HTML? 
    // No, user wanted "performant files". One file is best.
    // Hack: We append to the global file. In a real build we'd rebuild the whole bundle every time.
    // Let's just append to the in-memory string of the global CSS? No, we already wrote it.
    // We will append to the files.

    for (const componentName of usedComponents) {
        const cssPath = path.join(COMPONENTS_DIR, componentName, `${componentName}.css`);
        const jsPath = path.join(COMPONENTS_DIR, componentName, `${componentName}.js`);

        const css = await getFileContent(cssPath);
        const js = await getFileContent(jsPath);

        if (css) await fs.appendFile(path.join(PUBLIC_DIR, 'assets', 'style.css'), `\n/* ${componentName} */\n${css}`);
        if (js) await fs.appendFile(path.join(PUBLIC_DIR, 'assets', 'main.js'), `\n/* ${componentName} */\n${js}`);
    }

    finalHtml = dom.serialize();

    // 6. Write Output
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, finalHtml);
    console.log(`Generated: ${path.relative(PUBLIC_DIR, outputPath)}`);
}

async function generateDynamicRoutes() {
    // 1. Categories
    const catTemplatePath = path.join(PAGES_DIR, 'builders-journal', 'category', 'main-category.html');
    if (await fs.pathExists(catTemplatePath)) {
        for (const cat of categories) {
            const outputPath = path.join(PUBLIC_DIR, 'builders-journal', cat.slug, 'index.html');
            // We can inject context variables by pre-processing the template string before passing to processPage?
            // processPage takes a file path. Let's modify processPage to accept content or read context?
            // Actually, simplest is to read the template here, replace {{ values }}, then write to a temp file? 
            // OR make processPage accept overrides.

            // Let's do a trick: We pass the 'context' object to processPage and handle templating there?
            // processPage handles {{ title }} etc.
            // But we need to replace {{ category.title }} inside the content.
            // Let's assume the template uses specific placeholders we support.

            await processPage(catTemplatePath, outputPath, {
                title: cat.title,
                description: cat.description
            });
        }
    }

    // 2. Articles
    const artTemplatePath = path.join(PAGES_DIR, 'builders-journal', 'article', 'main-article.html');
    if (await fs.pathExists(artTemplatePath)) {
        for (const post of posts) {
            const cat = categories.find(c => c.slug === post.category); // Assuming relationship
            const catSlug = cat ? cat.slug : 'uncategorized';

            const outputPath = path.join(PUBLIC_DIR, 'builders-journal', catSlug, post.slug + '.html');

            await processPage(artTemplatePath, outputPath, {
                title: post.title,
                description: post.content.substring(0, 100) // simple summary
            });
        }
    }
}

// Watch Mode
if (isWatch) {
    chokidar.watch(SRC_DIR).on('change', async (path) => {
        console.log(`File changed: ${path}`);
        await build();
    });
    console.log('👀 Watching for changes...');
}

// Initial Build
build();
