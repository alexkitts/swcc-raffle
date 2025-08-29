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
    return [1, 1200]; // [eliminations, delay]
  } else if (remaining <= 20) {
    return [5, 700];
  } else if (remaining <= 50) {
    return [10, 600];
  } else if (remaining <= 100) {
    return [20, 500];
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
  
  const [nextEliminations] = getEliminations(remaining);
  
  if (remaining === 0) {
    throwButton.textContent = "Game Over!";
    throwButton.disabled = true;
  } else {
    throwButton.textContent = `Bowl Ball (Next: ${Math.min(nextEliminations, remaining)} out)`;
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
  totalCount.textContent = players.length;
  // Use actual alive count for consistency
  const alive = [...document.querySelectorAll("td.player:not(.out)")];
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

function showWicketPopup(playerNumber, dismissalType) {
  const popup = document.createElement('div');
  popup.className = 'wicket-popup';
  popup.innerHTML = `#${playerNumber}<br>${dismissalType}`;
  document.body.appendChild(popup);
  
  // Remove popup after animation
  setTimeout(() => {
    document.body.removeChild(popup);
  }, 2000);
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
  
  const actualEliminations = Math.min(eliminationsThisRound, remaining);
  animating = true;
  throwButton.disabled = true;
  
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
      return;
    }
    
    const target = currentAlive[Math.floor(Math.random() * currentAlive.length)];
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
    
    // Use different dismissal messages for single-ball mode (≤10 players remaining)
    const currentAlive = [...document.querySelectorAll("td.player:not(.out)")];
    const isInFinalStage = currentAlive.length <= 10;
    const dismissalTypes = isInFinalStage ? finalDismissalTypes : regularDismissalTypes;
    
    const dismissalType = dismissalTypes[Math.floor(Math.random() * dismissalTypes.length)];
    showWicketPopup(playerNumber, dismissalType);
    
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