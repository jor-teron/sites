const display = document.querySelector('.display');
const buttons = document.querySelectorAll('.button');
let currentExpression = '';
let equationParts = [];

buttons.forEach(button => {
    button.addEventListener('click', () => {
        const value = button.textContent;

        if (value === 'C') {
            currentExpression = '';
            equationParts = [];
            display.value = '';
        } else if (value === 'Â±') {
            if (currentExpression && !isOperator(currentExpression.slice(-1))) {
                let lastNumber = getLastNumber();
                if (lastNumber) {
                    lastNumber = (parseFloat(lastNumber) * -1).toString();
                    updateLastNumber(lastNumber);
                    display.value = currentExpression;
                }
            }
        } else if (value === '=') {
            if (equationParts.length >= 1 && !isOperator(currentExpression.trim().slice(-1))) {
                const result = evaluateEquation();
                if (result === 'Error') {
                    display.value = 'Error';
                    currentExpression = '';
                    equationParts = [];
                } else {
                    display.value = `${currentExpression.trim()} = ${result}`;
                    currentExpression = result.toString();
                    equationParts = [result];
                }
            }
        } else if (['+', '-', '*', '/'].includes(value)) {
            if (currentExpression && !isOperator(currentExpression.slice(-1))) {
                currentExpression += ` ${value} `;
                equationParts.push(value);
                display.value = currentExpression;
            } else if (currentExpression && isOperator(currentExpression.trim().slice(-1))) {
                currentExpression = currentExpression.slice(0, -3) + ` ${value} `;
                equationParts[equationParts.length - 1] = value;
                display.value = currentExpression;
            }
        } else if (value === '<') { // Changed from 'DEL' to '<'
            if (currentExpression.length > 0) {
                currentExpression = currentExpression.slice(0, -1);

                if (equationParts.length > 0) {
                    let lastPart = equationParts[equationParts.length - 1];
                    if (!isOperator(lastPart)) {
                        if (lastPart.length > 1) {
                            equationParts[equationParts.length - 1] = lastPart.slice(0, -1);
                        } else {
                            equationParts.pop();
                            if (equationParts.length > 0 && isOperator(equationParts[equationParts.length - 1])) {
                                equationParts.pop();
                                currentExpression = currentExpression.trim();
                            }
                        }
                    } else {
                        equationParts.pop();
                        currentExpression = currentExpression.trim();
                    }
                }
                display.value = currentExpression;
            }
        }
        else {
            currentExpression += value;
            if (!isOperator(value)) {
                if (equationParts.length === 0 || isOperator(equationParts[equationParts.length - 1])) {
                    equationParts.push(value);
                } else {
                    equationParts[equationParts.length - 1] += value;
                }
            }
            display.value = currentExpression;
        }
    });
});

function isOperator(char) {
    return ['+', '-', '*', '/'].includes(char);
}

function getLastNumber() {
    const parts = currentExpression.trim().split(' ');
    return parts.length > 0 && !isOperator(parts[parts.length - 1]) ? parts[parts.length - 1] : null;
}

function updateLastNumber(newNumber) {
    const parts = currentExpression.trim().split(' ');
    parts[parts.length - 1] = newNumber;
    currentExpression = parts.join(' ');
    equationParts[equationParts.length - 1] = newNumber;
}

function evaluateEquation() {
    if (equationParts.length === 1) return parseFloat(equationParts[0]);
    let result = parseFloat(equationParts[0]);
    for (let i = 1; i < equationParts.length; i += 2) {
        const op = equationParts[i];
        const nextNum = parseFloat(equationParts[i + 1]);
        if (isNaN(nextNum)) return 'Error';
        switch (op) {
            case '+': result += nextNum; break;
            case '-': result -= nextNum; break;
            case '*': result *= nextNum; break;
            case '/':
                if (nextNum === 0) return 'Error';
                result /= nextNum;
                break;
        }
    }
    return result;
}
