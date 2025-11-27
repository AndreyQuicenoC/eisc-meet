import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../../stores/useAuthStore";
import "./Navbar.scss";

interface NavbarProps {
  showAuthButtons?: boolean;
  onLogout?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({
  showAuthButtons = true,
  onLogout,
}) => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      // Llamar al logout del store
      await logout();
      
      // Si hay callback personalizado, ejecutarlo
      if (onLogout) {
        onLogout();
      }
      
      // Navegar al login
      navigate("/login");
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("Error al cerrar sesión:", err.message);
    }
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="navbar">
      <div className="navbar-container">
        <div className="logo">
          <h1>CHARLATON</h1>
        </div>

        {/* Botón hamburguesa - visible en móvil */}
        <button
          className="hamburger-btn"
          onClick={toggleMenu}
          aria-label="Toggle menu"
        >
          <span className={`hamburger-icon ${isMenuOpen ? "open" : ""}`}>
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>

        {/* Navegación - solo visible cuando NO hay usuario autenticado */}
        {!user && (
          <nav className="nav-links">
            <a href="#">Inicio</a>
            <a href="#">Producto</a>
            <a href="#">Sobre nosotros</a>
          </nav>
        )}

        {/* Sección de autenticación */}
        {showAuthButtons && (
          <div className={`auth-section ${isMenuOpen ? "mobile-open" : ""}`}>
            {user ? (
              <>
                <span className="user-name">
                  {user.displayName || user.email}
                </span>
                <button onClick={handleLogout} className="btn-outline">
                  Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn-outline"
                  onClick={() => navigate("/login")}
                >
                  INICIAR SESIÓN
                </button>
                <button className="btn-primary">REGISTRARSE</button>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
