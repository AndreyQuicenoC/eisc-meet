import React from 'react'

const Login: React.FC = () => {

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
    };

    return (
        <div className="container-page">
            <div >
                <h1>
                    Iniciar Sesión
                </h1>

                <form onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="username">
                            Usuario
                        </label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Ingresa tu usuario"
                            required
                        />
                    </div>

                    <div >
                        <label htmlFor="password" >
                            Contraseña
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Ingresa tu contraseña"
                            required

                        />
                    </div>

                    <button type="submit" >
                        Iniciar Sesión
                    </button>
                </form>

                <div>

                    <span >
                        o inicia sesión con
                    </span>


                    <button>
                        <img src="icons/google-icon.svg" alt="Iniciar sesión con Google" width={24} height={24} />
                        <span>Google</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

export default Login