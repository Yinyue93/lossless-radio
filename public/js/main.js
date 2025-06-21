document.addEventListener('DOMContentLoaded', () => {
    const audioPlayer = document.getElementById('audioPlayer');
    const playBtn = document.getElementById('playBtn');
    const stopBtn = document.getElementById('stopBtn');

    playBtn.addEventListener('click', () => {
        if (audioPlayer.src !== window.location.origin + '/stream') {
            audioPlayer.src = '/stream';
        }
        audioPlayer.play();
    });

    stopBtn.addEventListener('click', () => {
        audioPlayer.pause();
        // We no longer set audioPlayer.src = '' to allow for pausing and resuming.
    });
}); 