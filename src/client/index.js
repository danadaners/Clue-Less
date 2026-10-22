/**
 * Client entry point.
 */
import { CLIENT, PRIVATE } from "../shared/messages.js";

const socket = io();

/** UI elements */
const $ = (id) => document.getElementById(id);


const createBtn = $("create-btn");
const nameInput = $('display-name');

// Create Game
createBtn.addEventListener("click", () => {
  const hostName = nameInput.value.trim();
  if(!hostName) {
       console.error("Name cannot be blank.");
       return;
    }
  socket.emit(CLIENT.CREATE_GAME, { hostName }, (res) => {
      if (!res.ok) {
      console.error(res.error);
      return;
    }

    console.log(`Game created by ${res.host} with ID ${res.gameId}`)
  });

});

socket.on("gameList", (games) => {
  const list = $("game-list");
  list.innerHTML = "";
 
  if (games.length === 0) {
    list.innerHTML = '<li class="muted">No games yet.</li>';
    return;
  }
 
  for (const { gameId, host } of games) {
    const li = document.createElement("li");
    li.textContent = `${host}'s game`;
    const id = document.createElement("div");
    id.className = "muted";
    id.textContent = gameId;
    li.appendChild(id);
    list.appendChild(li);
  }
});
 

