export class MockFirestore {
    private data: Record<string, Record<string, any>> = {};

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
                getSignedUrl: async () => [`https://storage.googleapis.com/mock-bucket/${name}?token=mock`]
            })
        };
    }
}

export class MockAuth {
    async verifyIdToken(token: string) {
        if (token === 'mock-token') {
            return { uid: 'mock-user', email: 'mock@example.com' };
        }
        throw new Error('Invalid token');
    }
}
