import { create } from 'zustand'
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase.config";

interface User {
    displayName: string | null,
    email: string | null,
    photoURL: string | null,
}

type AuthStore = {
    user: User | null,
    setUser: (user: User) => void,
    initAuthObserver: () => () => void,
    loginWithGoogle: () => Promise<void>,
    logout: () => Promise<void>
}

const useAuthStore = create<AuthStore>()((set) => ({
    user: null,
    setUser: (user: User) => set({ user }),

    initAuthObserver: () => {
        const unsubscribe = onAuthStateChanged(
            auth,
            (fbUser) => {
                if (fbUser) {
                    const userLogged: User = {
                        displayName: fbUser.displayName,
                        email: fbUser.email,
                        photoURL: fbUser.photoURL,
                    };
                    set({ user: userLogged });
                } else {
                    set({ user: null });
                }
            },
            (err) => {
                console.error(err);
            }
        );
        return unsubscribe;
    },

    loginWithGoogle: async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (e: unknown) {
            const error = e instanceof Error ? e : new Error(String(e));
            console.error("Error logging in with Google:", error.message);
        }
    },

    logout: async () => {
        try {
            await signOut(auth);
        } catch (e: unknown) {
            const error = e instanceof Error ? e : new Error(String(e));
            console.error("Error logging out:", error.message);
        }
    },
}))

export default useAuthStore;