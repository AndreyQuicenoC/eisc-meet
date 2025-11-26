import { create } from 'zustand'
import { onAuthStateChanged, signInWithRedirect, signOut } from "firebase/auth";
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
            await signInWithRedirect(auth, googleProvider);
        } catch (e: any) {
            console.error(e);
        }
    },

    logout: async () => {
        try {
            await signOut(auth);
        } catch (e: any) {
            console.error(e);
        }
    },
}))

export default useAuthStore;