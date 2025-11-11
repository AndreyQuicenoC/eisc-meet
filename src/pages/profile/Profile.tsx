import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../../stores/useAuthStore";
import Navbar from "../../components/Navbar/Navbar";
import Footer from "../../components/Footer/Footer";
import "./Profile.scss";

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) {
      navigate("/login");
    }
  }, [user, navigate]);

  const handleLogout = () => {
    navigate("/login");
  };

  return (
    <div className="profile-page">
      <Navbar onLogout={handleLogout} />
      
      <div className="profile-card">
        <div className="profile-content">
          <h1>Bienvenido</h1>
          <p className="welcome-text">{user?.displayName || user?.email}</p>
          <button onClick={() => navigate("/chat")} className="chat-button">
            Ir al Chat Global
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Profile;
