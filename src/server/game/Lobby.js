/**
 * Game Logic subsystem: Lobby (Design Document 3.2).
 * Tracks the host and character choices before the game starts.
 * Owned by Game; discarded when the game starts.
 */
import { GameError } from "../GameError.js";
import { ERROR_CODES } from "../../shared/messages.js";

export class Lobby {
    #hostPlayerId;
    #characterChoices = new Map();

    constructor(hostPlayerId){
        this.#hostPlayerId = hostPlayerId;
    }

    get hostPlayerId(){
        return this.#hostPlayerId;
    }

    /**
     * Saves a player's character choice. Picking again replaces the earlier choice.
     * @throws {GameError} CHARACTER_TAKEN if another player already chose the character
     */
    selectCharacter(playerId, characterId){
        for(const[otherId, chosen] of this.#characterChoices) {
            if(chosen == characterId && otherId !== playerId){
                throw new GameError(ERROR_CODES.CHARACTER_TAKEN, `${characterId} is already taken`);
            }
        }
        this.#characterChoices.set(playerId, characterId);
    }
    
    /**
     * Checks if the game can start.
     * @returns true if there are 3-6 players and everyone has a character, false otherwise
     */
    canStart(playerCount){
        return playerCount >= 3 && playerCount <= 6 && this.#characterChoices.size === playerCount;
    }

    /**
     * If the host leaves, reassigns another host. 
     * @param {string[]} playerIds the remaining players, in join order
     */
    reassignHost(playerIds){
        this.#hostPlayerId = playerIds[0] ?? null;
    }
}