const Slot = require('../models/Slot');

module.exports = {
  async listSlots(req, res) {
    const user = req.session && req.session.user;
    const isAdmin = user && user.role === 'admin';
    try {
      const slots = await Slot.getSlotsByCoach(isAdmin ? null : user.id);
      return res.render('slotsIndex', {
        user,
        slots,
        messages: req.flash()
      });
    } catch (err) {
      console.error('listSlots error:', err);
      req.flash('error', 'Unable to load slots');
      return res.render('slotsIndex', {
        user,
        slots: [],
        messages: req.flash()
      });
    }
  },

  async showCreateForm(req, res) {
    const user = req.session && req.session.user;
    return res.render('slotsCreateStandalone', {
      user,
      messages: req.flash()
    });
  },

  async createSlot(req, res) {
    const user = req.session && req.session.user;
    const coachId = user && user.role === 'admin' ? (parseInt(req.body.coach_id, 10) || user.id) : user.id;
    const slotDate = req.body.slot_date ? String(req.body.slot_date).trim() : '';
    const slotTime = req.body.slot_time ? String(req.body.slot_time).trim() : '';
    const duration = req.body.duration_minutes ? parseInt(req.body.duration_minutes, 10) : null;
    const location = req.body.location ? String(req.body.location).trim() : '';
    const note = req.body.note ? String(req.body.note).trim() : '';

    if (!slotDate || !slotTime) {
      req.flash('error', 'Please choose both date and time');
      return res.redirect('/slots/create');
    }
    const timeMatch = slotTime.match(/^(\d{2}):(\d{2})/);
    if (!timeMatch) {
      req.flash('error', 'Invalid slot time.');
      return res.redirect('/slots/create');
    }
    if (!Number.isFinite(duration) || duration <= 0 || duration % 30 !== 0) {
      req.flash('error', 'Duration must be in 30-minute increments (e.g. 60, 90, 120).');
      return res.redirect('/slots/create');
    }
    const minutes = parseInt(timeMatch[2], 10);
    if (Number.isNaN(minutes) || minutes % 30 !== 0) {
      req.flash('error', 'Slots must start on a 30-minute boundary (e.g. 10:00, 10:30).');
      return res.redirect('/slots/create');
    }

    try {
      await Slot.createSlot({
        coach_id: coachId,
        slot_date: slotDate,
        slot_time: slotTime,
        duration_minutes: Number.isFinite(duration) ? duration : null,
        location: location || null,
        note: note || null
      });
      req.flash('success', 'Slot saved');
      return res.redirect('/slots');
    } catch (err) {
      console.error('createSlot error:', err);
      req.flash('error', 'Unable to save slot');
      return res.redirect('/slots/create');
    }
  },

  async deleteSlot(req, res) {
    const user = req.session && req.session.user;
    const slotId = parseInt(req.params.id, 10);
    const isAdmin = user && user.role === 'admin';
    if (!Number.isFinite(slotId)) {
      req.flash('error', 'Invalid slot');
      return res.redirect('/slots');
    }
    try {
      await Slot.deleteSlot(slotId, isAdmin ? null : user.id);
      req.flash('success', 'Slot deleted');
      return res.redirect('/slots');
    } catch (err) {
      console.error('deleteSlot error:', err);
      req.flash('error', 'Unable to delete slot');
      return res.redirect('/slots');
    }
  }
};
