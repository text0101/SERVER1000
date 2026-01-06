import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const AppWrapper = () => {
    useEffect(() => {
        // Fade in the app once React has mounted
        const root = document.getElementById('root');
        if (root) {
            root.classList.add('loaded');
        }
    }, []);

    return <App />;
};

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);

root.render(
    <React.StrictMode>
        <AppWrapper />
    </React.StrictMode>
);
