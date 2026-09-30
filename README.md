# Timetable Designer

A browser-based timetable designer for creating and exporting custom timetables as images.

Originally designed around an iOS Medium widget, the project is evolving into a more flexible timetable editor supporting different layouts, sizes, and use cases.


## Features

* A live timetable card that is exactly the image you download — edit days, times and classes right on it
* Drag subjects onto the timetable, or tap any slot to pick or type one
* Double periods, lunch breaks and room/teacher notes
* Five styles (Paper, Ink, Mist, Bloom, Mono) and every iOS widget size, including iPad Extra Large
* Undo/redo, autosave, and saving or opening timetables as JSON
* Works on phones and desktops, in light and dark mode


## Roadmap

* [x] Dark mode
* [x] Custom number of days and periods
* [x] Drag-and-drop subjects
* [x] Improve mobile responsiveness
* [x] Improve iOS widget layouts and formatting
* [x] Support additional iOS widget sizes
* [ ] Add wallpaper and custom-size exports
* [x] Add multiple timetable templates
* [x] Improve the overall UI and visual design


## Running locally

The site uses JavaScript modules, so it needs to be served rather than opened as a file:

```sh
python3 -m http.server
```

Then open http://localhost:8000. Run the tests with `node --test` (Node 22+).


## Supported Output Formats

The project is primarily intended for generating timetable images that can be used as:

* iOS widgets
* Wallpapers
* Custom-sized images


## License

This project is open source and available under the [MIT License](LICENSE).
