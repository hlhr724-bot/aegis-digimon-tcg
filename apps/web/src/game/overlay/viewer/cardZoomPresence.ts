let openZooms = 0;

export const cardZoomPresence = {
  isOpen() {
    return openZooms > 0;
  },
  register() {
    openZooms += 1;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      openZooms -= 1;
    };
  },
};
