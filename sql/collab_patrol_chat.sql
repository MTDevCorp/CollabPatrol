CREATE TABLE IF NOT EXISTS /*_*/collab_patrol_chat (
	cpc_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
	cpc_rev_id INT UNSIGNED NOT NULL,
	cpc_user_id INT UNSIGNED NOT NULL DEFAULT 0,
	cpc_user_text VARBINARY(255) NOT NULL DEFAULT '',
	cpc_message VARBINARY(2000) NOT NULL DEFAULT '',
	cpc_timestamp VARBINARY(14) NOT NULL DEFAULT '',
	cpc_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0,
	cpc_deleted_by VARBINARY(255) NOT NULL DEFAULT '',
	cpc_deleted_at VARBINARY(14) NOT NULL DEFAULT ''
) /*$wgDBTableOptions*/;

CREATE INDEX /*i*/cpc_rev_id ON /*_*/collab_patrol_chat (cpc_rev_id);
CREATE INDEX /*i*/cpc_timestamp ON /*_*/collab_patrol_chat (cpc_timestamp);
CREATE INDEX /*i*/cpc_user_id ON /*_*/collab_patrol_chat (cpc_user_id);
