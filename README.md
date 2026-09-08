# SWCC Reverse Raffle Draw

This runs the club's reverse raffle draw on a laptop, projected for the room.

## Running it

Double-click `index.html`. It opens in your browser and just works — no
internet connection, no server, nothing to install.

## Before the night: fill in the CSV

Open `template.csv` in Excel (or any spreadsheet program) and fill in one row
per ticket, like this:

```
Name,Number
Kyle Mitchell,2
Adam Young,3
```

Each ticket needs a name and a number. You can have up to **250 tickets**.

Ticket **number 1 is special — it is always reserved for the live auction**.
Leave it in the CSV like any other ticket (give it a name, or use "Auction"
as a placeholder). It cannot be knocked out with the rest; it survives all
the way down to the last 10, and then it gets auctioned off live instead of
drawn.

When you're ready, click **Upload CSV** and choose your finished file.

## Running the draw

Use the **Knock out in steps of** dropdown to choose the size of each
step: 1, 5, 10, 20, 25 or 50. The default is 10.

This is a step size, not always the number that goes out next. The first
click squares the field up to a round multiple of the step, so it is often
a smaller number:

- 187 tickets in steps of 10 knocks out 7 first, leaving 180.
- 130 tickets in steps of 20 knocks out 10 first, leaving 120.
- After that, each click knocks out a full step, until 10 tickets remain.

You never have to work this out yourself. The button always names the real
number — **Bowl Ball (Next: 7 out)** — and whenever it differs from the
step size, a note beside it spells out where the field is heading.

Wait for the animation to finish before clicking again; the button
disables itself mid-throw so you cannot double-click by accident.

## The auction

When the draw gets down to the last 10 tickets, a popup appears for the
live auction of ticket number 1. Type in the winning bidder's name and
confirm, or press **Escape** to skip the auction and move straight on.

## The final 10

Once the auction is done (or skipped), the last 10 go out one at a time,
and this stage is bowled by hand so you can narrate it. The button becomes
**Bowl Next Ball** and each click bowls exactly one delivery, so you set
the pace and can talk between balls.

Each wicket takes anywhere from 4 to 8 balls, rolled fresh each time like a
die, so a round lasts a predictable length without being predictable. The batting order is also
reshuffled before every wicket, so being safe last time means nothing.
With two players left they simply alternate.

Keep clicking until one ticket remains; the winner is shown on screen.

## If something goes wrong: recovery

Progress is saved automatically after every wicket falls, so it's safe to
close the laptop lid, reload the page, or even have the browser crash on
you. When you reopen `index.html`, a **Resume** banner appears offering to
pick up right where you left off — click **Resume**, or **Start fresh** to
begin a new draw instead.

If you see a **red warning banner** saying progress cannot be saved
automatically (this can happen depending on browser settings), use the
**Export progress** button regularly to save a backup file by hand, and use
**Import progress** to load that file back in if you need to recover.

**Reset draw** wipes everything and starts over from scratch — use it only
if you really want to start again from an empty board.

## Running the tests (for whoever maintains this)

From the project folder, run:

```
node --test
```

No install and no arguments needed — it uses Node's built-in test runner.
