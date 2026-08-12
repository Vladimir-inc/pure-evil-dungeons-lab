# Pure Evil - Dungeons Lab

A free Foundry VTT (v13+) module that gives the GM quiet control over the dice.

Pick a character, pick a die, and either bend the odds or queue an exact result for the next
roll. Nothing appears in chat and nothing tells the table. Works with any game system and any
die, including coins, Fate dice and whatever your system invented.

## What it does

**Probabilities.** A weight slider for every face of a die. 1 is fair, higher means that face
turns up more often. Available on dice up to 100 faces.

**Forced rolls.** Queue an exact result and how many times it should fire. The next roll of that
die returns it, then the queue moves on.

**Your own rolls.** "GM rolls" sits at the top of the list as its own entry, so anything you roll
yourself counts: an NPC attack, a /roll in chat, a player's sheet you opened.

**Master switch.** One toggle in the footer makes the whole world roll fair again, without losing
anything you set up.

Everything is GM only. Players never see the window, the button or a single notification.

## Requirements

Pure Evil stores its settings through [Dungeons LAB Hub](https://github.com/Vladimir-inc/dungeons-lab-hub),
so the Hub has to be installed and enabled. Without it the module shuts itself down and tells you
why.

## Install

In Foundry VTT go to **Add-on Modules**, press **Install Module**, and paste this manifest URL:

```
https://github.com/Vladimir-inc/pure-evil-dungeons-lab/releases/latest/download/module.json
```

You can also grab the zip from the [Releases page](https://github.com/Vladimir-inc/pure-evil-dungeons-lab/releases)
and unpack it into your `Data/modules` folder.

## How to use it

1. Click the demon icon next to the chat input.
2. Flip the switch on a character's row to take control of their dice.
3. Open the **Probabilities** tab to weight the faces, or **Forced rolls** to queue an exact
   result.
4. The icon glows while anything is armed, so you always know the dice are not honest.

## Plays well with

- **Dice So Nice.** Pure Evil decides the number, Dice So Nice shows it landing.
- **Dice Tray.** Quick dice buttons in chat, handy for firing off the rolls you have set up.

## Languages

English and Russian.

## Support

Bugs and ideas go to the [issue tracker](https://github.com/Vladimir-inc/pure-evil-dungeons-lab/issues)
or the [Dungeons Lab Discord](https://discord.gg/MUxsQCf587).

If the module saved your session, you can [buy us a coffee](https://ko-fi.com/dungeonslab).

## License

See [LICENSE](LICENSE). Free to use at your table, not free to rehost or resell.
