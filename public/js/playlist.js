document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const flacFilesInput = document.getElementById('flacFiles');
    const playlistUl = document.getElementById('playlist');
    const saveOrderBtn = document.getElementById('saveOrderBtn');
    const progressContainer = document.getElementById('uploadProgressContainer');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');

    let draggedItem = null;

    function fetchPlaylist() {
        fetch('/api/playlist')
            .then(response => response.json())
            .then(data => {
                playlistUl.innerHTML = '';
                data.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = item;
                    li.draggable = true;
                    playlistUl.appendChild(li);
                });
            });
    }

    uploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const files = flacFilesInput.files;
        if (files.length === 0) {
            return;
        }

        const formData = new FormData();
        for (const file of files) {
            formData.append('flacFiles', file);
        }

        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                progressBar.style.width = percentComplete + '%';
                progressText.textContent = percentComplete + '%';
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const data = JSON.parse(xhr.responseText);
                alert(data.message);
                fetchPlaylist(); // Refresh playlist
            } else {
                 console.error('Upload failed with status', xhr.status);
                alert('Upload failed.');
            }
            // Hide progress bar after a short delay
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 1000);
        });

        xhr.addEventListener('error', () => {
            console.error('Upload failed');
            alert('Upload failed.');
            progressContainer.style.display = 'none';
        });

        xhr.open('POST', '/api/upload', true);
        xhr.send(formData);
    });

    saveOrderBtn.addEventListener('click', () => {
        const newOrder = Array.from(playlistUl.children).map(li => li.textContent);
        fetch('/api/playlist/order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newOrder })
        })
        .then(response => response.json())
        .then(data => alert(data.message))
        .catch(err => {
             console.error('Failed to save order', err);
             alert('Failed to save order.');
        });
    });

    // Drag and drop for reordering
    playlistUl.addEventListener('dragstart', (e) => {
        draggedItem = e.target;
        setTimeout(() => {
            e.target.style.display = 'none';
        }, 0);
    });

    playlistUl.addEventListener('dragend', (e) => {
        setTimeout(() => {
            if (draggedItem) {
                draggedItem.style.display = '';
                draggedItem = null;
            }
        }, 0);
    });

    playlistUl.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(playlistUl, e.clientY);
        const draggable = document.querySelector('.dragging'); // this is the item being dragged, but we are using draggedItem
        if (afterElement == null) {
            playlistUl.appendChild(draggedItem);
        } else {
            playlistUl.insertBefore(draggedItem, afterElement);
        }
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // Initial load
    fetchPlaylist();
}); 