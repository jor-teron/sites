function updateClock() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  
  hours = hours % 12;
  hours = hours ? hours : 12; // Convert 0 to 12 for midnight/noon
  hours = hours < 10 ? '0' + hours : hours;
  const minutesPadded = minutes < 10 ? '0' + minutes : minutes;
  const secondsPadded = seconds < 10 ? '0' + seconds : seconds;
  
//  const timeString = `${hours}:${minutesPadded}:${secondsPadded} ${ampm}`;
  const timeString = `${hours}:${minutesPadded} ${ampm}`;
  const clockElement = document.querySelector('.clock');
  if (clockElement) {
    clockElement.textContent = timeString;
  }

  // Update analog clock
  const hourHand = document.querySelector('.hour-hand');
  const minuteHand = document.querySelector('.minute-hand');
  const secondHand = document.querySelector('.second-hand');
  
  if (hourHand && minuteHand && secondHand) {
    const hourDeg = ((hours % 12) * 30) + (minutes * 0.5);
    const minuteDeg = minutes * 6;
    const secondDeg = seconds * 6;
    
    hourHand.style.transform = `rotate(${hourDeg}deg)`;
    minuteHand.style.transform = `rotate(${minuteDeg}deg)`;
    secondHand.style.transform = `rotate(${secondDeg}deg)`;
  }
}

setInterval(updateClock, 1000);
updateClock(); // Initial call to avoid 1-second delay

