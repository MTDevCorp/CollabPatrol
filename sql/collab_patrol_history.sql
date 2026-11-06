CREATE TABLE IF NOT EXISTS /*_*/collab_patrol_history (
	cph_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
	cph_rev_id INT UNSIGNED NOT NULL,
	cph_action VARBINARY(32) NOT NULL DEFAULT '',
	cph_user_id INT UNSIGNED NOT NULL DEFAULT 0,
	cph_user_text VARBINARY(255) NOT NULL DEFAULT '',
	cph_comment VARBINARY(1000) NOT NULL DEFAULT '',
	cph_timestamp VARBINARY(14) NOT NULL DEFAULT ''
) /*$wgDBTableOptions*/;

CREATE INDEX /*i*/cph_rev_id ON /*_*/collab_patrol_history (cph_rev_id);
CREATE INDEX /*i*/cph_user_id ON /*_*/collab_patrol_history (cph_user_id);
CREATE INDEX /*i*/cph_timestamp ON /*_*/collab_patrol_history (cph_timestamp);
