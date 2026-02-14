if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', {
            scope: './'
        })
            .then((registration) => {
                console.log('✅ SW enregistré avec succès ! Scope:', registration.scope);
            })
            .catch((error) => {
                console.error('❌ Erreur d\'enregistrement du SW:', error);
            });

    });
}