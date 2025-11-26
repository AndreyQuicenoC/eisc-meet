import { createBrowserRouter, Navigate } from "react-router-dom";
import Login from "../pages/login/Login";
import Profile from "../pages/profile/Profile";
import Chat from "../pages/chat/Chat";
import { ProtectedRoute } from "../components/ProtectedRoute";

export const routes = [
  {
    path: "/",
    element: <Navigate to="/login" replace />,
  },
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/profile",
    element: (
      <ProtectedRoute>
        <Profile />
      </ProtectedRoute>
    ),
  },
  {
    path: "/chat",
    element: (
      <ProtectedRoute>
        <Chat />
      </ProtectedRoute>
    ),
  },
];

export const router = createBrowserRouter(routes);
