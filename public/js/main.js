document.addEventListener('DOMContentLoaded', () => {
    const audioPlayer = document.getElementById('audioPlayer');
    const playBtn = document.getElementById('playBtn');
    const stopBtn = document.getElementById('stopBtn');

    playBtn.addEventListener('click', () => {
        audioPlayer.src = '/stream';
        audioPlayer.play();
    });

    stopBtn.addEventListener('click', () => {
        audioPlayer.pause();
        audioPlayer.src = ''; // Stop buffering
    });
}); 