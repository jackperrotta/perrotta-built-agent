document.addEventListener('DOMContentLoaded', () => {
    const navbar = document.getElementById('main-navbar');
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    // Scroll Effect
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Active Link Logic
    const currentPath = window.location.pathname;
    const links = document.querySelectorAll('.nav-links a:not(.btn-primary)'); // Exclude contact button from underline style usually

    links.forEach(link => {
        const linkPath = link.getAttribute('href');
        if (currentPath === linkPath || (currentPath.startsWith(linkPath) && linkPath !== '/')) {
            link.classList.add('active');
        }
    });

    // Mobile Menu
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            // Animate bars if needed
        });
    }
});
