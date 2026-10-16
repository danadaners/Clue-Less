const socket = io();
const statusText = document.getElementById('status');
 
socket.on('connect', () => {
  statusText.textContent = 'Connected to server.';
});
 
socket.on('disconnect', () => {
  statusText.textContent = 'Disconnected from server.';
});
 