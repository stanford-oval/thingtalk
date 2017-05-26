module.exports = {
    _schema: {
        "builtin": {
            "triggers": {
                "timer": {
                    args: ["interval"],
                    types: ["Measure(ms)"]
                },
                "at": {
                    args: ["time"],
                    types: ["Time"]
                }
            },
            "queries": {
                "get_time": {
                    args: ["time"],
                    types: ["Date"]
                }
            },
            "actions": {
                "notify" : {
                    args: ["message"],
                    types: ["String"]
                },
                "debug_log": {
                    args: ["message"],
                    types: ["String"]
                }
            }
        },
        "security-camera": {
            "triggers": {},
            "queries": {
                "get_snapshot": {
                    args: ["picture_url"],
                    types: ["Picture"]
                }
            },
            "actions": {}
        },
        "youtube": {
            "triggers": {},
            "queries": {
                "search_videos": {
                    args: ["query", "video_url"],
                    types: ["String", "Entity(tt:url)"]
                }
            },
            "actions": {}
        },
        "phone": {
            "triggers": {
                "receive_sms": {
                    args: ["from", "body"],
                    types: ["Entity(tt:phone_number)", "String"]
                }
            },
            "actions": {
                "send_sms": {
                    args: ["to", "body"],
                    types: ["Entity(tt:phone_number)", "String"]
                }
            },
            "queries": {}
        },
        "ninegag": {
            "triggers": {},
            "actions": {},
            "queries": {
                "get_latest": {
                    args: ["arg1", "arg2", "picture_url"],
                    types: ["String", "String", "Entity(tt:picture)"]
                }
            }
        },
        "twitter": {
            "triggers": {
                "source": {
                    args: ["text", "hashtags", "urls", "from", "inReplyTo", "__reserved"],
                    types: ["String","Array(String)","Array(String)","String","String","Boolean"],
                }
            },
            "actions": {
                "sink": {
                    args: ["status"],
                    types: ["String"]
                },
                "post_picture": {
                    args: ["caption", "picture_url"],
                    types: ["String", "Entity(tt:picture)"]
                }
            },
            "queries": {}
        },
        "weatherapi": {
            "triggers": {
                "weather": {
                    args: ["location", "temperature"],
                    types: ["Location", "Measure(C)"]
                }
            },
            "actions": {},
            "queries": {}
        },
        "omlet": {
            "triggers": {
                "incomingmessage": {
                    args: ["type", "message"],
                    types: ["Enum(text,picture)", "String"]
                }
            },
            "actions": {},
            "queries": {}
        },
        "test": {
            "triggers": {
                "source": {
                    args: ["value"],
                    types: ["Number"]
                }
            },
            "actions": {},
            "queries": {}
        },
        "thermostat": {
            "triggers": {
                "temperature": {
                    args: ["time", "temperature"],
                    types: ["Date", "Measure(C)"]
                }
            },
            "actions": {
                "set_target_temperature": {
                    args: ["value"],
                    types: ["Measure(C)"]
                }
            },
            "queries": {}
        },
        "xkcd": {
            "triggers": {
                "new_comic": {
                    args: ["title", "link", "picture_url"],
                    types: ["String", "Entity(tt:url)", "Entity(tt:picture)"],
                }
            },
            "actions": {},
            "queries": {}
        }
    },

    getSchemas: function() {
        return this._schema;
    },

    getMetas: function() {
        return this._meta;
    }
};
