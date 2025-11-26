import type React from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../../stores/useAuthStore";
import Navbar from "../../components/Navbar/Navbar";
import Footer from "../../components/Footer/Footer";
import "./Login.scss";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { user, loginWithGoogle } = useAuthStore();

  useEffect(() => {
    if (user) {
      navigate("/chat");
    }
  }, [user, navigate]);

  const handleLoginGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    await loginWithGoogle();
  };

  return (
    <div className="login-page">
      {/* Header */}
      <Navbar showAuthButtons={true} />

      {/* Main Content */}
      <main className="main-content">
        <div className="login-card">
          {/* Logo */}
          <div className="logo-container">
            <div className="logo-icon">
              <svg fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h2>Ingresa a tu cuenta</h2>
          <p className="subtitle">Descubre qué está pasando en tu región</p>

          {/* Google Sign In Button */}
          <button onClick={handleLoginGoogle} className="google-signin-btn">
            <img src="icons/google-icon.svg" alt="Google" />
            Iniciar sesión con Google
          </button>

          {/* Register Link */}
          <p className="register-link">
            ¿No tienes una cuenta? <a href="#">Regístrate</a>
          </p>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Login;
