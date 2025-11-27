import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    updateDoc,
    serverTimestamp,
} from "firebase/firestore";



import type {
    CollectionReference,
    Timestamp,
} from "firebase/firestore";



import { db } from "../lib/firebase.config"; 

export interface User {
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
    createdAt?: Timestamp | null;
    updatedAt?: Timestamp | null;
}



export type UserCreate = Omit<User, "id" | "createdAt" | "updatedAt">;
export type UserUpdate = Partial<Omit<User, "id" | "createdAt">>;

class UserDAO {
    private collectionRef: CollectionReference;



    constructor() {
        this.collectionRef = collection(db, "users");
    }
    async getUserById(id: string): Promise<
        | { success: true; data: User }
        | { success: false; data: null; error?: string }
    > {
        try {
            const snap = await getDoc(doc(this.collectionRef, id));
            if (!snap.exists()) {
                return { success: false, data: null };
            }
            return { success: true, data: snap.data() };
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error("Error getting document:", error.message);
            return { success: false, data: null, error: error.message };
        }
    }

        async createUser(userData: UserCreate): Promise<
        | { success: true; id: string }
        | { success: false; error: string }
    > {
        try {
            const docRef = await addDoc(this.collectionRef, {
                ...userData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            } as User);
            console.log("Document written with ID:", docRef.id);
            return { success: true, id: docRef.id };
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error("Error adding document:", error.message);
            return { success: false, error: error.message };
        }
    }

        async updateUser(id: string, userData: UserUpdate): Promise<
        | { success: true }
        | { success: false; error: string }
    > {
        try {
            const userRef = doc(this.collectionRef, id);
            await updateDoc(userRef, {
                ...userData,
                updatedAt: serverTimestamp(),
            } as Partial<User>);
            console.log("Document successfully updated!");
            return { success: true };
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error("Error updating document:", error.message);
            return { success: false, error: error.message };
        }
    }

        async deleteUser(id: string): Promise<
        | { success: true }
        | { success: false; error: string }
    > {
        try {
            await deleteDoc(doc(this.collectionRef, id));
            console.log("Document successfully deleted!");
            return { success: true };
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error("Error removing document:", error.message);
            return { success: false, error: error.message };
        }
    }
}

export default new UserDAO();

