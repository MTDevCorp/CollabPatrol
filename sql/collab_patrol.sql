CREATE TABLE IF NOT EXISTS /*_*/collab_patrol (
	cp_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
	cp_rev_id INT UNSIGNED NOT NULL,
	cp_page_id INT UNSIGNED NOT NULL DEFAULT 0,
	cp_status VARBINARY(32) NOT NULL DEFAULT 'pending',
	cp_user_id INT UNSIGNED NOT NULL DEFAULT 0,
	cp_user_text VARBINARY(255) NOT NULL DEFAULT '',
	cp_comment VARBINARY(1000) NOT NULL DEFAULT '',
	cp_timestamp VARBINARY(14) NOT NULL DEFAULT '',
	cp_expires VARBINARY(14) NOT NULL DEFAULT ''
) /*$wgDBTableOptions*/;

CREATE UNIQUE INDEX /*i*/cp_rev_id ON /*_*/collab_patrol (cp_rev_id);
CREATE INDEX /*i*/cp_status ON /*_*/collab_patrol (cp_status);
CREATE INDEX /*i*/cp_expires ON /*_*/collab_patrol (cp_expires);
CREATE INDEX /*i*/cp_user_id ON /*_*/collab_patrol (cp_user_id);
