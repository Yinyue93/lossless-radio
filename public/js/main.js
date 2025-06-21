document.addEventListener('DOMContentLoaded', () => {
    const audioPlayer = document.getElementById('audioPlayer');
    const playBtn = document.getElementById('playBtn');
    const stopBtn = document.getElementById('stopBtn');

    playBtn.addEventListener('click', () => {
        // Only do something if the player is paused. This prevents
        // restarting the stream if the play button is clicked again.
        if (audioPlayer.paused) {
            // If the player doesn't have a source yet, this is the very first play.
            if (!audioPlayer.currentSrc) {
                audioPlayer.src = '/stream';
            } else {
                // If it has a source, it means we were paused.
                // Reload the stream to fetch the live broadcast.
                audioPlayer.load();
            }
            audioPlayer.play();
        }
    });

    stopBtn.addEventListener('click', () => {
        audioPlayer.pause();
    });
}); 