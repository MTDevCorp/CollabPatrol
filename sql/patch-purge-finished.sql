-- A reviewed (finished) revision no longer keeps an entry: its history is enough.
DELETE FROM /*_*/collab_patrol WHERE cp_status = 'finished';
