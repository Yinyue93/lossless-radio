document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const flacFilesInput = document.getElementById('flacFiles');
    const playlistUl = document.getElementById('playlist');
    const saveOrderBtn = document.getElementById('saveOrderBtn');

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
        const formData = new FormData();
        for (const file of flacFilesInput.files) {
            formData.append('flacFiles', file);
        }

        fetch('/api/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            alert(data.message);
            fetchPlaylist(); // Refresh playlist
        })
        .catch(err => {
            console.error('Upload failed', err);
            alert('Upload failed.');
        });
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