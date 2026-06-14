const fs = require('fs');
const content = fs.readFileSync('src/commands/uninstall.js', 'utf8');
const newContent = content.replace(/<<<<<<< HEAD\r?\n([\s\S]*?)\r?\n=======\r?\n[\s\S]*?\r?\n>>>>>>> [0-9a-f]{40}/g, '$1');
fs.writeFileSync('src/commands/uninstall.js', newContent);
console.log('Fixed uninstall.js');
