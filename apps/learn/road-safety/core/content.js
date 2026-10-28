/* Road Safety RS1 — words: traffic light states, rules cards and the situation questions for the quiz (Indian rules:
   traffic keeps LEFT, so when you cross, the nearest traffic comes from your RIGHT). RS.lights, RS.rules, RS.situations. */
window.RS = window.RS || {};
(() => {
  const R = window.RS;
  R.lights = {
    red: { car: 'Red: STOP. Vehicles wait behind the stop line.', walk: 'Green walking man: you may cross now, but still look right, left, right.' },
    amber: { car: 'Amber: the light is about to turn red. Stop if you safely can, do not speed up.', walk: 'Red man: wait on the footpath. Do not start crossing.' },
    green: { car: 'Green: GO, but only if the road ahead is clear. Give way to people already crossing.', walk: 'Red man: wait. Vehicles are moving.' },
    flash: { car: 'Flashing amber: slow down and go carefully. Give way to people crossing.', walk: 'Signal not working: cross only with great care, or with a traffic police officer\u2019s help.' }
  };
  R.rules = [
    ['\u{1F440}', 'Look Right \u2013 Left \u2013 Right', 'In India traffic keeps to the LEFT, so the nearest cars come from your RIGHT. Stop at the kerb, look right, look left, look right again, and listen. Cross when it is clear, walking straight across, not running.'],
    ['\u{1F993}', 'Use the zebra crossing', 'Cross at a zebra crossing, a footbridge, a subway or at a green walking man. Never cross from between parked vehicles or at a bend.'],
    ['\u{1F6B6}', 'Walk on the footpath', 'Walk on the footpath. If there is none, walk on the RIGHT edge of the road, facing the oncoming traffic, in single file.'],
    ['\u{1FA96}', 'Helmet for rider and pillion', 'Everyone on a two-wheeler wears a helmet, children too: the rider AND the pillion. Use a good (ISI-marked) helmet and fasten the strap.'],
    ['\u{1F697}', 'Seatbelt for everyone', 'Everyone in a car wears a seatbelt, in the front and in the back. Children sit in the back seat, small children in a child seat.'],
    ['\u{1F4F5}', 'No phone on the road', 'Drivers must never use a phone while driving. When you walk or cycle, put the phone away and take out your earphones so you can hear traffic.'],
    ['\u{1F526}', 'Be seen at night', 'Wear light or reflective clothes, carry a torch. A cycle needs a front light, a red rear reflector and a bell.'],
    ['\u{1F6B2}', 'Cycling safely', 'Ride on the left, in a straight line, one behind the other. Give hand signals before turning. Never hold on to another moving vehicle.'],
    ['\u{1F6AB}', 'Too young to drive', 'You need a licence to drive: 18 years for cars and motorbikes (16 for small gearless bikes under 50 cc, with a licence). Underage driving is against the law.'],
    ['\u{1F691}', 'Make way, call 112', 'Make way for ambulances and fire engines. In an emergency call 112 (ambulance 108). Tell them where you are. People who help accident victims are protected by the Good Samaritan law.']
  ];
  // [question, right answer, wrong answers..., why]
  R.situations = [
    ['The light turns amber as your car comes near the signal. What should the driver do?', 'Slow down and stop if it is safe', ['Speed up to get through', 'Sound the horn and go', 'Stop suddenly in the middle of the crossing'], 'Amber means the light will soon be red.'],
    ['The light is red but there are no cars around. What do you do?', 'Wait for green', ['Go, nobody is coming', 'Go slowly', 'Flash your lights and go'], 'Red always means stop, even on an empty road.'],
    ['You want to cross a road in India. Which way do you look first?', 'Right', ['Left', 'Straight ahead', 'Up'], 'Traffic keeps left, so the nearest cars come from the right.'],
    ['There is no footpath. Where should you walk?', 'On the right edge, facing the traffic', ['On the left edge, with the traffic', 'In the middle of the road', 'Anywhere, it does not matter'], 'Facing the traffic lets you see what is coming.'],
    ['You ride pillion on your uncle\u2019s scooter for a short trip. What must you do?', 'Wear a helmet with the strap fastened', ['Nothing, it is a short trip', 'Hold the helmet in your hand', 'Only the rider needs a helmet'], 'Rider and pillion must both wear helmets.'],
    ['You sit in the back seat of a car. What should you do?', 'Wear the seatbelt', ['Nothing, belts are for the front', 'Kneel to look out', 'Put your head out of the window'], 'Seatbelts are for everyone in the car.'],
    ['An ambulance with its siren on comes from behind. What should vehicles do?', 'Move to the left and let it pass', ['Race it', 'Stop in the middle of the road', 'Follow it closely'], 'Make way for emergency vehicles.'],
    ['You see a road accident. What number do you call?', '112', ['100100', '1947', '999'], '112 is India\u2019s emergency number (108 for an ambulance).'],
    ['Your ball rolls onto the road. What do you do?', 'Stop and ask an adult for help', ['Run after it quickly', 'Jump over the divider', 'Wave at cars to stop'], 'Never run onto the road.'],
    ['You get off a bus and want to cross. What is safest?', 'Wait until the bus has gone, then cross carefully', ['Cross right in front of the bus', 'Run behind the bus', 'Cross while it is still moving'], 'A standing bus hides you from drivers and drivers from you.'],
    ['You are cycling home after dark. What do you need?', 'Front light, rear reflector and bright clothes', ['Nothing, the street lights are enough', 'Dark clothes', 'Ride in the middle of the road'], 'Drivers must be able to see you.'],
    ['Your friend is texting while crossing the road. What do you say?', 'Put the phone away and look', ['It is fine if you walk fast', 'Text with one hand', 'Use earphones too'], 'Eyes and ears on the road.'],
    ['Which side of the road do vehicles keep to in India?', 'The left', ['The right', 'The middle', 'Any side'], 'India drives on the left.'],
    ['How old must you be to get a licence for a car?', '18', ['12', '14', '16'], 'Car and motorbike licences start at 18.'],
    ['You come to an unguarded railway crossing (no gate). What do you do?', 'Stop, look both ways, listen, then cross if clear', ['Cross quickly without stopping', 'Wait on the tracks', 'Follow the vehicle in front'], 'Trains cannot stop quickly.'],
    ['The green walking man starts flashing as you reach the kerb. What do you do?', 'Wait for the next green man', ['Start crossing quickly', 'Run across', 'Cross halfway and stop'], 'Flashing means the signal is about to change.'],
    ['Where is the safest place to cross?', 'At a zebra crossing or footbridge', ['Between parked cars', 'Near a bend', 'Wherever is nearest'], 'Drivers expect people there and can see you.'],
    ['A friend offers you a ride on his bike, but he is 14. What do you do?', 'Say no: he is too young to drive', ['Go, but hold on tight', 'Go without a helmet', 'Ride three on the bike'], 'Underage driving is against the law and unsafe.']
  ].map(([q, a, w, why]) => ({ q, a, w, why }));
})();
