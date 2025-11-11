import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/useAuthStore'
import './Profile.scss'

const Profile: React.FC = () => {
    const navigate = useNavigate()
    const { user } = useAuthStore()

    useEffect(() => {
        if (!user) {
            navigate('/login')
        }
    }, [user, navigate])

    return (
        <div className="profile-page">
            <div className="profile-card">
                <h1>Bienvenido</h1>
                <p className="welcome-text">
                    {user?.displayName || user?.email}
                </p>
                <button 
                    onClick={() => navigate('/chat')}
                    className="chat-button"
                >
                    Ir al Chat Global
                </button>
            </div>
        </div>
    )
}

export default Profile