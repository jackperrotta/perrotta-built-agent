export class MockFirestore {
    private data: Record<string, Record<string, any>> = {
        users: {
            'jperrotta-uid': {
                role: 'admin',
                email: 'jperrotta521@gmail.com'
            }
        }
    };

    batch() {
        const operations: Array<() => Promise<void>> = [];
        return {
            set: (docRef: { set: (data: any) => Promise<void> }, data: any) => {
                operations.push(() => docRef.set(data));
            },
            commit: async () => {
                for (const operation of operations) {
                    await operation();
                }
            }
        };
    }

    collection(name: string) {
        return {
            doc: (id: string) => {
                return {
                    get: async () => {
                        const docData = this.data[name]?.[id];
                        return {
                            exists: !!docData,
                            data: () => docData
                        };
                    },
                    set: async (newData: any) => {
                        if (!this.data[name]) this.data[name] = {};
                        this.data[name][id] = newData;
                    },
                    update: async (newData: any) => {
                        if (!this.data[name]?.[id]) throw new Error('Document not found');
                        this.data[name][id] = { ...this.data[name][id], ...newData };
                    },
                    delete: async () => {
                        if (this.data[name]?.[id]) {
                            delete this.data[name][id];
                        }
                    }
                };
            },
            where: () => ({
                orderBy: () => ({
                    get: async () => ({ docs: [] })
                })
            }),
            orderBy: (field: string, direction: string) => ({
                get: async () => {
                    const collection = this.data[name] || {};
                    // Basic array return, no actual sorting implemented in mock
                    return {
                        docs: Object.values(collection).map(data => ({ data: () => data }))
                    };
                }
            })
        };
    }
}

export class MockStorage {
    bucket() {
        return {
            file: (name: string) => ({
                getSignedUrl: async () => [`https://storage.googleapis.com/mock-bucket/${name}?token=mock`],
                download: async () => [Buffer.from('', 'utf-8')]
            })
        };
    }
}

export class MockAuth {
    async verifyIdToken(token: string) {
        if (token === 'mock-token') {
            return { uid: 'mock-user', email: 'mock@example.com' };
        }
        if (token === 'mock-token-admin') {
            return { uid: 'jperrotta-uid', email: 'jperrotta521@gmail.com' };
        }
        throw new Error('Invalid token');
    }
}

