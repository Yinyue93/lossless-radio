document.addEventListener('DOMContentLoaded', () => {
    const audioPlayer = document.getElementById('audioPlayer');
    const playBtn = document.getElementById('playBtn');
    const stopBtn = document.getElementById('stopBtn');

    let isFirstPlay = true;
    let streamUrl = '/stream';
    let wasStopped = false; // Track if user explicitly stopped vs just paused

    // Add error handling for audio player
    audioPlayer.addEventListener('error', (e) => {
        console.error('Audio player error:', e);
        // Reset and try to reconnect
        resetAudioPlayer();
    });

    // Add event listeners for debugging
    audioPlayer.addEventListener('loadstart', () => {
        console.log('Audio: Load started');
    });

    audioPlayer.addEventListener('loadeddata', () => {
        console.log('Audio: Data loaded');
    });

    audioPlayer.addEventListener('stalled', () => {
        console.log('Audio: Stalled');
    });

    audioPlayer.addEventListener('waiting', () => {
        console.log('Audio: Waiting for data');
    });

    function resetAudioPlayer() {
        console.log('Resetting audio player');
        audioPlayer.pause();
        audioPlayer.src = '';
        audioPlayer.load();
        isFirstPlay = true;
        wasStopped = false;
    }

    function startStream() {
        if (isFirstPlay || wasStopped) {
            // First play or resuming after stop - connect to live stream
            console.log(isFirstPlay ? 'Starting stream for first time' : 'Reconnecting to live stream after stop');
            audioPlayer.src = streamUrl + '?t=' + Date.now(); // Add timestamp to ensure fresh connection
            isFirstPlay = false;
            wasStopped = false;
        } else {
            console.log('Resuming stream');
            // For resume after pause (not stop), check if we need to reconnect
            if (audioPlayer.readyState === HTMLMediaElement.HAVE_NOTHING || 
                audioPlayer.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
                console.log('Reconnecting to stream');
                audioPlayer.src = streamUrl + '?t=' + Date.now();
            }
        }
        
        audioPlayer.play().catch(err => {
            console.error('Playback failed:', err);
            // Reset and try again
            console.log('Retrying playback after error');
            audioPlayer.src = streamUrl + '?t=' + Date.now();
            audioPlayer.play().catch(retryErr => {
                console.error('Retry playback also failed:', retryErr);
            });
        });
    }

    playBtn.addEventListener('click', () => {
        if (audioPlayer.paused) {
            startStream();
        }
    });

    stopBtn.addEventListener('click', () => {
        console.log('Stopping playback');
        audioPlayer.pause();
        wasStopped = true; // Mark as explicitly stopped
        // Reset the audio element to disconnect from stream
        audioPlayer.src = '';
        audioPlayer.load();
    });

    // Clean up on page unload to prevent memory leaks
    window.addEventListener('beforeunload', () => {
        console.log('Page unloading - cleaning up audio player');
        resetAudioPlayer();
    });

    // Removed the visibility change handler that was pausing audio when switching tabs
    // Users should be able to listen to radio in background tabs

    // Periodic cleanup to prevent memory buildup (optional)
    setInterval(() => {
        // Force garbage collection hint for audio buffer
        if (audioPlayer.paused && !isFirstPlay) {
            const currentTime = audioPlayer.currentTime;
            const src = audioPlayer.src;
            if (src && audioPlayer.buffered.length > 0) {
                // Check if we have a lot of buffered data
                const bufferedEnd = audioPlayer.buffered.end(audioPlayer.buffered.length - 1);
                const bufferedStart = audioPlayer.buffered.start(0);
                const bufferedDuration = bufferedEnd - bufferedStart;
                
                // If we have more than 5 minutes of buffered data, consider resetting
                if (bufferedDuration > 300) {
                    console.log('Large buffer detected, considering cleanup');
                    // This is aggressive - you might want to adjust this logic
                    // based on your specific needs
                }
            }
        }
    }, 60000); // Check every minute
}); 