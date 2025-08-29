const ball = document.getElementById("ball");
const scoreboardContent = document.getElementById("scoreboard-content");
const wicketCount = document.getElementById("wicket-count");
const remainingCount = document.getElementById("remaining-count");
const totalCount = document.getElementById("total-count");
const throwButton = document.getElementById("throw");
let animating = false;
let wickets = 0;
let players = [];

// Load sounds
const wicketHitSound = new Audio('./sound/wickethit.mp3');
const winnerSound = new Audio('./sound/winner.mp3');

// Get elimination count and delay based on remaining players
function getEliminations(remaining) {
  if (remaining <= 10) {
    return [1, 1200]; // [eliminations, delay] - single eliminations in final stage
  } else if (remaining <= 20) {
    // Calculate exact eliminations needed to land on 10
    const eliminationsNeeded = remaining - 10;
    return [eliminationsNeeded, 1000];
  } else if (remaining <= 30) {
    // For 21-30, eliminate enough to get to around 15, then next round will get to 10
    const eliminationsNeeded = Math.min(10, remaining - 15);
    return [eliminationsNeeded, 600];
  } else if (remaining <= 50) {
    return [15, 600];
  } else if (remaining <= 100) {
    return [25, 500];
  } else {
    return [40, 400];
  }
}

// Update button text based on remaining players
function updateButtonText() {
  // Use the same logic as throwBall() - count actual alive DOM elements
  const alive = [...document.querySelectorAll("td.player:not(.out)")];
  const remaining = alive.length;
  
  if (remaining === 1) {
    throwButton.textContent = "🏆 WINNER FOUND! 🏆";
    throwButton.disabled = true;
    return;
  }
  
  if (remaining === 10 && !document.querySelector('.auction-popup')) {
    // We're at 10 players but auction popup is not showing, game is ready for final stage
    throwButton.textContent = `Bowl Ball (Final Stage: 1 out)`;
    return;
  }
  
  const [nextEliminations] = getEliminations(remaining);
  
  // Adjust elimination count if we're protecting player #1
  let actualNextEliminations = nextEliminations;
  if (remaining > 10) {
    // Check if player #1 is still alive
    const playerOneAlive = alive.some(cell => cell.dataset.number === "1");
    if (playerOneAlive) {
      // We have one fewer target available
      actualNextEliminations = Math.min(nextEliminations, remaining - 1);
    }
  }
  
  if (remaining === 0) {
    throwButton.textContent = "Game Over!";
    throwButton.disabled = true;
  } else {
    throwButton.textContent = `Bowl Ball (Next: ${Math.min(actualNextEliminations, remaining)} out)`;
  }
}

// Function to fetch and parse CSV (now optional)
async function loadPlayersFromCSV() {
  try {
    const response = await fetch('./players.csv');
    if (!response.ok) {
      throw new Error('CSV file not found');
    }
    const csvText = await response.text();
    
    players = csvText
      .split('\n')
      .filter(line => line.trim()) // Remove empty lines
      .map(line => {
        const [name, number] = line.split(',').map(item => item.trim());
        return { name, number: parseInt(number) };
      });
    
    if (players.length > 0) {
      displayPlayers();
    } else {
      showUploadMessage();
    }
  } catch (error) {
    console.log('No CSV file found, showing upload message');
    showUploadMessage();
  }
}

// Show the upload message and hide players table
function showUploadMessage() {
  document.getElementById('upload-message').style.display = 'block';
  document.getElementById('players').style.display = 'none';
  document.getElementById('throw').disabled = true;
  totalCount.textContent = '0';
  remainingCount.textContent = '0';
}

// Hide upload message and show players table
function hideUploadMessage() {
  document.getElementById('upload-message').style.display = 'none';
  document.getElementById('players').style.display = 'table';
  document.getElementById('throw').disabled = false;
}

// Function to display players in the UI
function displayPlayers() {
  const playersTable = document.getElementById("players");
  playersTable.innerHTML = ''; // Clear existing players
  
  const playersPerRow = 35;
  let currentRow = null;
  
  players.forEach((player, index) => {
    // Create new row every 30 players
    if (index % playersPerRow === 0) {
      currentRow = document.createElement("tr");
      playersTable.appendChild(currentRow);
    }
    
    const cell = document.createElement("td");
    cell.className = "player";
    // Split number into digits and join with <br> for vertical display
    const verticalNumber = player.number.toString().split('').join('<br>');
    cell.innerHTML = verticalNumber;
    cell.dataset.name = player.name;
    cell.dataset.number = player.number;
    currentRow.appendChild(cell);
  });
  
  // Update scoreboard with total count
  updateScoreboardDisplay();
  // Update button text after DOM is populated
  updateButtonText();
}

// Function to update scoreboard display
function updateScoreboardDisplay() {
  // Use actual alive count for consistency
  const alive = [...document.querySelectorAll("td.player:not(.out)")];
  
  // Check if we're in final 10 stage by looking for final-player class
  const inFinalStage = document.querySelector('.final-player') !== null;
  
  if (inFinalStage) {
    totalCount.textContent = '10'; // Show 10 as total in final stage
  } else {
    totalCount.textContent = players.length; // Show original total in regular stage
  }
  
  remainingCount.textContent = alive.length;
}

// Initialize players on page load
loadPlayersFromCSV();

// Cricket-themed dismissal messages
const regularDismissalTypes = [
  "Bowled!",
  "Caught!",
  "LBW!",
  "Run Out!",
  "Stumped!",
  "Golden Duck!",
  "Duck!",
  "Diamond Duck!",
  "Caught Behind!",
  "Chopped On!",
  "Bounced Out!"
];

const finalDismissalTypes = [
  "Retired Hurt!",
  "Caught at Gully: Adamant it's a Bump Ball!",
  "Level 3 Offence: Swearing at the Umpire!",
  "Run Out: Deflected by the Bowler (Non Striker)!",
  "Bowled: Left a Straight One!",
  "Hit Wicket: Cutting the Off Spinner!",
  "LBW: You've Middled It!",
  "Mankad by the Bowler!",
  "Stumped Off a Wide!"
];

// Working copy of final dismissal types that gets consumed
let availableFinalDismissalTypes = [...finalDismissalTypes];

function showWinnerBanner(winner) {
  const banner = document.createElement('div');
  banner.className = 'winner-banner';
  banner.innerHTML = `
    <div class="trophy">🏆</div>
    <div class="winner-text">WINNER!</div>
    <div class="winner-details">#${winner.number} ${winner.name}</div>
  `;
  document.body.appendChild(banner);
  
  // Play winner sound
  winnerSound.currentTime = 0;
  winnerSound.play().catch(error => console.log('Winner sound play failed:', error));
  
  // Don't remove the banner - let it stay and jiggle forever!
}

function showWicketPopup(playerNumber, dismissalType, duration = 2000) {
  const popup = document.createElement('div');
  popup.className = 'wicket-popup';
  popup.innerHTML = `#${playerNumber}<br>${dismissalType}`;
  
  // Set custom animation duration
  popup.style.animationDuration = `${duration / 1000}s`;
  
  document.body.appendChild(popup);
  
  // Remove popup after animation
  setTimeout(() => {
    document.body.removeChild(popup);
  }, duration);
}

function updateScoreboard() {
  wickets++;
  wicketCount.textContent = wickets;
  updateScoreboardDisplay();
  updateButtonText(); // Update button text after each wicket
  
  // Clear placeholder text on first wicket
  if (wickets === 1) {
    scoreboardContent.innerHTML = '';
  }
}

function addWicketToScoreboard(playerElement) {
  const wicketEntry = document.createElement("div");
  wicketEntry.className = "wicket-entry";
  const playerName = playerElement.dataset.name;
  const playerNumber = playerElement.dataset.number;
  wicketEntry.innerHTML = `${wickets}. #${playerNumber} ${playerName} - <strong>OUT</strong>`;
  scoreboardContent.appendChild(wicketEntry);
  
  // Scroll to bottom to show latest wicket
  scoreboardContent.scrollTop = scoreboardContent.scrollHeight;
}

function throwBall() {
  if (animating) return;
  const alive = [...document.querySelectorAll("td.player:not(.out)")];
  if (alive.length === 0) return alert("All eliminated!");
  
  // Determine how many to eliminate based on remaining players
  const remaining = alive.length;
  const [eliminationsThisRound, ballDelay] = getEliminations(remaining);
  
  // Adjust eliminations if protecting player #1
  let actualEliminations = eliminationsThisRound;
  if (remaining > 10) {
    const playerOneAlive = alive.some(cell => cell.dataset.number === "1");
    if (playerOneAlive) {
      // Make sure we don't eliminate more than we have available targets
      actualEliminations = Math.min(eliminationsThisRound, remaining - 1);
    }
  }
  
  actualEliminations = Math.min(actualEliminations, remaining);
  animating = true;
  throwButton.disabled = true;
  
  // Check if this round will take us to exactly 10 players (auction time)
  const willReachFinal10 = remaining - actualEliminations === 10;
  
  // Launch balls one by one
  let ballsThrown = 0;
  
  const throwInterval = setInterval(() => {
    const currentAlive = [...document.querySelectorAll("td.player:not(.out)")];
    
    // Check if we have a winner (only 1 player left)
    if (currentAlive.length === 1 && ballsThrown > 0) {
      clearInterval(throwInterval);
      animating = false;
      throwButton.disabled = false;
      
      // Show winner banner
      const winner = players.find(p => p.number.toString() === currentAlive[0].dataset.number);
      showWinnerBanner(winner);
      
      // Update button to show game is over
      throwButton.textContent = "🏆 WINNER FOUND! 🏆";
      throwButton.disabled = true;
      return;
    }
    
    if (currentAlive.length === 0 || ballsThrown >= actualEliminations) {
      clearInterval(throwInterval);
      animating = false;
      throwButton.disabled = false;
      
      // Check if we've reached exactly 10 players - trigger auction
      if (willReachFinal10 && currentAlive.length === 10) {
        // Wait a moment for the final elimination to complete, then show auction
        setTimeout(() => {
          showAuctionPopup();
        }, 1000);
      }
      return;
    }
    
    // Get available targets (protect player #1 unless we're in final 10)
    let availableTargets = currentAlive;
    if (currentAlive.length > 10) {
      // Protect player #1 by filtering them out
      availableTargets = currentAlive.filter(cell => cell.dataset.number !== "1");
    }
    
    // If no available targets (shouldn't happen), use all alive
    if (availableTargets.length === 0) {
      availableTargets = currentAlive;
    }
    
    const target = availableTargets[Math.floor(Math.random() * availableTargets.length)];
    throwSingleBall(target);
    ballsThrown++;
  }, ballDelay);
}

function throwSingleBall(target) {
  const rect = target.getBoundingClientRect();
  const cx = window.innerWidth/2;
  const cy = window.innerHeight - 40; // Start from bottom
  const tx = rect.left + rect.width/2, ty = rect.top + rect.height/2;

  // Animate ball with smooth parabolic arc and shrinking effect
  
  // Calculate arc height based on distance
  const distance = Math.sqrt((tx-cx)**2 + (ty-cy)**2);
  const arcHeight = Math.min(200, distance * 0.3); // Adaptive arc height
  
  ball.animate([
    { 
      transform: `translateX(-50%) translate(0px, 0px) scale(1)`,
      offset: 0 
    },
    { 
      transform: `translateX(-50%) translate(${(tx-cx)*0.2}px, ${(ty-cy)*0.2 - arcHeight*0.64}px) scale(0.9)`,
      offset: 0.2 
    },
    { 
      transform: `translateX(-50%) translate(${(tx-cx)*0.4}px, ${(ty-cy)*0.4 - arcHeight*0.96}px) scale(0.75)`,
      offset: 0.4 
    },
    { 
      transform: `translateX(-50%) translate(${(tx-cx)*0.6}px, ${(ty-cy)*0.6 - arcHeight*0.96}px) scale(0.6)`,
      offset: 0.6 
    },
    { 
      transform: `translateX(-50%) translate(${(tx-cx)*0.8}px, ${(ty-cy)*0.8 - arcHeight*0.64}px) scale(0.45)`,
      offset: 0.8 
    },
    { 
      transform: `translateX(-50%) translate(${tx-cx}px, ${ty-cy}px) scale(0.3)`,
      offset: 1 
    }
  ], { duration: 800, easing: 'ease-out' }).onfinish = () => {
    target.classList.add("out");
    target.style.transform = "scale(1.2) rotate(15deg)";
    
    // Play wicket hit sound
    wicketHitSound.currentTime = 0; // Reset sound to start
    wicketHitSound.play().catch(error => console.log('Sound play failed:', error));
    
    // Show cricket-themed popup
    const playerNumber = target.dataset.number;
    
    // Use different dismissal messages for single-ball mode (≤10 players remaining AFTER this elimination)
    const currentAlive = [...document.querySelectorAll("td.player:not(.out)")];
    const isInFinalStage = (currentAlive.length - 1) < 10; // Only use final messages when going to 9 or fewer
    
    let dismissalType;
    if (isInFinalStage) {
      // Use unique messages for final stage - remove each message after use
      if (availableFinalDismissalTypes.length === 0) {
        // If we've used all unique messages, refill the array
        availableFinalDismissalTypes = [...finalDismissalTypes];
      }
      const randomIndex = Math.floor(Math.random() * availableFinalDismissalTypes.length);
      dismissalType = availableFinalDismissalTypes.splice(randomIndex, 1)[0];
    } else {
      // Use regular messages (can repeat)
      dismissalType = regularDismissalTypes[Math.floor(Math.random() * regularDismissalTypes.length)];
    }
    
    // Show popup with longer duration for final stage
    const popupDuration = isInFinalStage ? 10000 : 2000; // 10 seconds for final stage, 2 seconds otherwise
    showWicketPopup(playerNumber, dismissalType, popupDuration);
    
    // Update scoreboard
    updateScoreboard();
    addWicketToScoreboard(target);
    
    setTimeout(() => target.style.transform = "", 200);
    // reset ball with proper transform
    ball.style.transform = `translateX(-50%)`;
  };
}

// Function to parse CSV text and load players
function parseCSVAndLoadPlayers(csvText) {
  try {
    const lines = csvText.split('\n').filter(line => line.trim());
    
    // Skip header row if it exists (check if first row contains 'name' or 'Name')
    const startIndex = lines[0] && lines[0].toLowerCase().includes('name') ? 1 : 0;
    
    players = lines
      .slice(startIndex)
      .map(line => {
        const [name, number] = line.split(',').map(item => item.trim());
        return { name, number: parseInt(number) || 0 };
      })
      .filter(player => player.name && player.number); // Filter out invalid entries
    
    if (players.length === 0) {
      throw new Error('No valid players found in CSV');
    }
    
    // Reset game state
    wickets = 0;
    wicketCount.textContent = '0';
    animating = false;
    throwButton.disabled = false;
    // Reset available dismissal types for final stage
    availableFinalDismissalTypes = [...finalDismissalTypes];
    scoreboardContent.innerHTML = `
      <div style="text-align: center; color: #666; font-style: italic; margin-top: 20px;">
        Wickets will appear here...
      </div>
    `;
    
    displayPlayers();
    hideUploadMessage(); // Hide the upload message
    alert(`Successfully loaded ${players.length} players!`);
    
  } catch (error) {
    console.error('Error parsing CSV:', error);
    alert('Error parsing CSV file. Please check the format and try again.');
  }
}

// Handle CSV file upload
function handleCSVUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!file.name.toLowerCase().endsWith('.csv')) {
    alert('Please select a CSV file');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    parseCSVAndLoadPlayers(e.target.result);
  };
  reader.readAsText(file);
  
  // Reset the input so the same file can be uploaded again
  event.target.value = '';
}

document.getElementById("throw").onclick = throwBall;
document.getElementById("csv-upload").addEventListener("change", handleCSVUpload);
document.getElementById("upload-btn").addEventListener("click", () => {
  document.getElementById("csv-upload").click();
});

// Reset board for final 10 players - switch to name display
function resetBoardForFinal10() {
  const alive = [...document.querySelectorAll("td.player:not(.out)")];
  const playersTable = document.getElementById("players");
  playersTable.innerHTML = ''; // Clear the table
  
  // Get the alive players data
  const finalPlayers = alive.map(cell => ({
    name: cell.dataset.name,
    number: cell.dataset.number,
    element: cell
  }));
  
  // Create new layout with names (5 players per row for better spacing)
  const playersPerRow = 5;
  let currentRow = null;
  
  finalPlayers.forEach((player, index) => {
    if (index % playersPerRow === 0) {
      currentRow = document.createElement("tr");
      playersTable.appendChild(currentRow);
    }
    
    const cell = document.createElement("td");
    cell.className = "player final-player";
    cell.innerHTML = `<div class="player-name">${player.name}</div><div class="player-number">#${player.number}</div>`;
    cell.dataset.name = player.name;
    cell.dataset.number = player.number;
    currentRow.appendChild(cell);
  });
  
  // Clear scoreboard for final stage
  scoreboardContent.innerHTML = `
    <div style="text-align: center; color: #f9a825; font-weight: bold; margin-bottom: 10px;">
      🏆 FINAL 10 STAGE 🏆
    </div>
    <div style="text-align: center; color: #666; font-style: italic;">
      Final eliminations will appear here...
    </div>
  `;
  
  // Reset wicket count for final stage display
  wicketCount.textContent = '0';
  wickets = 0; // Reset for final stage counting
}

// Show auction popup when reaching final 10
function showAuctionPopup() {
  // Get the remaining alive players
  const aliveElements = [...document.querySelectorAll("td.player:not(.out)")];
  const alivePlayers = aliveElements.map(element => ({
    number: element.dataset.number,
    name: element.dataset.name
  })).sort((a, b) => parseInt(a.number) - parseInt(b.number)); // Sort by number
  
  // Create the table HTML for the 10 remaining players (2 columns x 5 rows)
  let tableHTML = '<table class="auction-table">';
  for (let i = 0; i < alivePlayers.length; i += 2) {
    tableHTML += '<tr>';
    for (let j = i; j < i + 2 && j < alivePlayers.length; j++) {
      const player = alivePlayers[j];
      tableHTML += `<td class="auction-cell">#${player.number} ${player.name}</td>`;
    }
    // Fill empty cell if odd number of players
    if (i + 1 >= alivePlayers.length) {
      tableHTML += '<td class="auction-cell"></td>';
    }
    tableHTML += '</tr>';
  }
  tableHTML += '</table>';
  
  const popup = document.createElement('div');
  popup.className = 'auction-popup';
  popup.innerHTML = `
    <div class="auction-content">
      <h2>🏆 FINAL 10: AUCTION TIME! 🏆</h2>
      ${tableHTML}
      <p>Enter the auction winner's name to continue:</p>
      <input type="text" id="auction-winner" placeholder="Enter winner's name..." maxlength="50">
      <div class="auction-buttons">
        <button id="auction-confirm">Confirm Winner</button>
        <button id="auction-cancel">Skip Auction</button>
      </div>
    </div>
  `;
  document.body.appendChild(popup);
  
  // Focus on the input
  setTimeout(() => {
    document.getElementById('auction-winner').focus();
  }, 100);
  
  // Handle confirm button
  document.getElementById('auction-confirm').onclick = () => {
    const winnerName = document.getElementById('auction-winner').value.trim();
    if (winnerName) {
      // Find player #1 and update their name if they're still alive
      const playerOneCell = document.querySelector('td.player[data-number="1"]:not(.out)');
      if (playerOneCell) {
        // Update player #1's data
        playerOneCell.dataset.name = winnerName;
        // Also update in the players array
        const playerOneData = players.find(p => p.number === 1);
        if (playerOneData) {
          playerOneData.name = winnerName;
        }
      }
      
      document.body.removeChild(popup);
      // Now reset the board for final 10
      resetBoardForFinal10();
    } else {
      alert('Please enter the auction winner\'s name');
    }
  };
  
  // Handle cancel button
  document.getElementById('auction-cancel').onclick = () => {
    document.body.removeChild(popup);
    // Reset board without changing player #1's name
    resetBoardForFinal10();
  };
  
  // Handle Enter key in input
  document.getElementById('auction-winner').onkeypress = (e) => {
    if (e.key === 'Enter') {
      document.getElementById('auction-confirm').click();
    }
  };
}

// Prevent accidental page refresh
window.addEventListener('beforeunload', function(e) {
  // Only show warning if game is in progress (players loaded and some eliminations have happened)
  if (players.length > 0 && wickets > 0) {
    e.preventDefault();
    e.returnValue = ''; // Chrome requires returnValue to be set
    return 'Are you sure you want to leave? Your raffle progress will be lost!';
  }
});

// Also prevent F5 refresh key
document.addEventListener('keydown', function(e) {
  // F5 key
  if (e.key === 'F5') {
    e.preventDefault();
    if (players.length > 0 && wickets > 0) {
      alert('Page refresh is disabled during the raffle to prevent accidental data loss!');
    }
  }
  
  // Ctrl+R refresh
  if (e.ctrlKey && e.key === 'r') {
    e.preventDefault();
    if (players.length > 0 && wickets > 0) {
      alert('Page refresh is disabled during the raffle to prevent accidental data loss!');
    }
  }
});