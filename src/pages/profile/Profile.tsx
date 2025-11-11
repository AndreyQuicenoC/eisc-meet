import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/useAuthStore'

const Profile: React.FC = () => {
    const navigate = useNavigate()
    const { user } = useAuthStore()

    useEffect(() => {
        if (!user) {
            navigate('/login')
        }
    }, [user, navigate])

    return (
        <div className="container-page">
            <div>
                <h1>Bienvenido</h1>
                <p className="text-center text-gray-700 mb-6">
                    {user?.displayName || user?.email}
                </p>
                <button 
                    onClick={() => navigate('/chat')}
                    className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-8 py-3 rounded-lg font-medium hover:from-cyan-600 hover:to-blue-600 transition-all shadow-md hover:shadow-lg"
                >
                    Ir al Chat Global
                </button>
            </div>
        </div>
    )
}

export default Profile