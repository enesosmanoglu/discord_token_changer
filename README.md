**Usage:**
```javascript
const tokenChanger = require('discord_token_changer');

let token = "###########################################################";

tokenChanger.changeToken(token).then(success => {
  // success: bool
  if (success)
    console.log("OK!");
}).catch(err => {
  console.error(err);
});
```
or
```javascript
const tokenChanger = require('discord_token_changer');

let token = "###########################################################";

(async () => {
  try {
    let success = await tokenChanger.changeToken(token);
  } catch (err) {
    console.error(err);
  }
})();
```