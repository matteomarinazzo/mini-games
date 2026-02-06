// Déterminer les directions dans lesquelles la caméra peut se déplacer
export function getCameraDirections(camera, canvas, gameData) {
  return {
    left: camera.x > 0,
    right: camera.x + canvas.width < gameData.worldWidth,
    up: camera.y > 0,
    down: camera.y + canvas.height < gameData.worldHeight,
  };
}

// Dessiner des flèches aux bords de l'écran pour indiquer les directions possibles
export function drawCameraHints(directions) {
  // ⬅️
  if (directions.left) {
    document.querySelector(".arrow.left").style.display = "block";
  } else {
    document.querySelector(".arrow.left").style.display = "none";
  }

  // ➡️
  if (directions.right) {
    document.querySelector(".arrow.right").style.display = "block";
  } else {
    document.querySelector(".arrow.right").style.display = "none";
  }

  // ⬆️
  if (directions.up) {
    document.querySelector(".arrow.up").style.display = "block";
  } else {
    document.querySelector(".arrow.up").style.display = "none";
  }

  // ⬇️
  if (directions.down) {
    document.querySelector(".arrow.down").style.display = "block";
  } else {
    document.querySelector(".arrow.down").style.display = "none";
  }
}