"use strict";

module.exports = {
    _schema: {
        "builtin": {
            "queries": {
                "get_time": {
                    args: ["time"],
                    types: ["Date"],
                    required: [false],
                    is_input: [false],
                }
            },
            "actions": {
                "say" : {
                    args: ["message"],
                    types: ["String"],
                    required: [true],
                    is_input: [true],
                },
                "debug_log": {
                    args: ["message"],
                    types: ["String"],
                    required: [true],
                    is_input: [true],
                }
            }
        },
        "security-camera": {
            "queries": {
                "current_event": {
                    args: ["start_time", "has_sound", "has_motion", "has_person", "picture_url"],
                    types: ["Date", "Boolean", "Boolean", "Boolean", "Picture"],
                    required: [false,false,false,false,false],
                    is_input: [false,false,false,false,false]
                },
                "get_snapshot": {
                    args: ["picture_url"],
                    types: ["Picture"],
                    required: [false],
                    is_input: [false],
                }
            },
            "actions": {
                "set_power": {
                    args: ["power"],
                    types: ["Enum(on,off)"],
                    required: [true],
                    is_input: [true]
                }
            }
        },
        "youtube": {
            "queries": {
                "search_videos": {
                    args: ["query", "video_url"],
                    types: ["String", "Entity(tt:url)"],
                    required: [true,false],
                    is_input: [true,false],
                }
            },
            "actions": {}
        },
        "phone": {
            "actions": {
                "send_sms": {
                    args: ["to", "body"],
                    types: ["Entity(tt:phone_number)", "String"],
                    required: [true,true],
                    is_input: [true,true],
                }
            },
            "queries": {
                "receive_sms": {
                    args: ["from", "body"],
                    types: ["Entity(tt:phone_number)", "String"],
                    required: [false,false],
                    is_input: [false,false],
                },
                "get_gps": {
                    args: ["location"],
                    types: ["Location"],
                    required: [false],
                    is_input: [false],
                }
            }
        },
        "ninegag": {
            "actions": {},
            "queries": {
                "get_latest": {
                    args: ["arg1", "arg2", "picture_url"],
                    types: ["String", "String", "Entity(tt:picture)"],
                    required: [false,false,false],
                    is_input: [false,false,false],
                }
            }
        },
        "twitter": {
            "actions": {
                "sink": {
                    args: ["status"],
                    types: ["String"],
                    required: [true],
                    is_input: [true],
                },
                "post_picture": {
                    args: ["caption", "picture_url"],
                    types: ["String", "Entity(tt:picture)"],
                    required: [true,true],
                    is_input: [true,true],
                }
            },
            "queries": {
                "source": {
                    args: ["text", "hashtags", "urls", "from", "inReplyTo", "__reserved"],
                    types: ["String","Array(Entity(tt:hashtag))","Array(String)","String","String","Boolean"],
                    required: [false,false,false,false,false,false],
                    is_input: [false,false,false,false,false,false],
                },
                "search": {
                    args: ["query", "text", "hashtags", "urls", "from", "inReplyTo"],
                    types: ["String", "String","Array(String)","Array(String)","String","String"],
                    required: [true, false,false,false,false,false],
                    is_input: [true, false,false,false,false,false],
                },
                "my_tweets": {
                    args: ["text", "hashtags", "urls", "in_reply_to", "tweet_id"],
                    types: ["String", "Array(Hashtag)", "Array(URL)", "Username", "String"],
                    required: [false, false, false, false, false],
                    is_input: [false, false, false, false, false]
                }
            }
        },
        "weatherapi": {
            "actions": {},
            "queries": {
                "weather": {
                    args: ["location", "temperature"],
                    types: ["Location", "Measure(C)"],
                    required: [true,false],
                    is_input: [true,false],
                }
            }
        },
        "omlet": {
            "actions": {},
            "queries": {
                "incomingmessage": {
                    args: ["type", "message"],
                    types: ["Enum(text,picture)", "String"],
                    required: [false,false],
                    is_input: [false,false],
                }
            }
        },
        "test": {
            "actions": {},
            "queries": {
                "source": {
                    args: ["value"],
                    types: ["Number"],
                    required: [false],
                    is_input: [false],
                }
            }
        },
        "thermostat": {
            "actions": {
                "set_target_temperature": {
                    args: ["value"],
                    types: ["Measure(C)"],
                    required: [true],
                    is_input: [true],
                }
            },
            "queries": {
                "get_temperature": {
                    args: ["time", "temperature"],
                    types: ["Date", "Measure(C)"],
                    required: [false,false],
                    is_input: [false,false],
                }
            }
        },
        "xkcd": {
            "actions": {},
            "queries": {
                "get_comic": {
                    args: ["number", "title", "link", "picture_url"],
                    types: ["Number", "String", "Entity(tt:url)", "Entity(tt:picture)"],
                    required: [false,false,false,false],
                    is_input: [true,false,false,false],
                }
            }
        },
        "fitbit": {
            "triggers": {},
            "actions": {},
            "queries": {
                "get_steps": {
                    args: ["date", "steps"],
                    types: ["Date", "Number"],
                    required: [false,false],
                    is_input: [false,false],
                }
            }
        },
        "com.google.drive": {
            "triggers": {},
            "actions": {},
            "queries": {
                "list_drive_files": {
                    args: ["file_id", "file_name"],
                    types: ["Entity(com.google.drive:file_id)", "String"],
                    required: [false, false],
                    is_input: [false, false]
                }
            }
        },
        "yandex": {
            "queries": {
                "translate": {
                    args: ["source_language", "target_language", "text", "translated_text"],
                    types: ["Entity(tt:iso_lang_code)", "Entity(tt:iso_lang_code)", "String", "String"],
                    required: [false, true, true, false],
                    is_input: [true, true, true, false]
                }
            }
        },
        "wsj": {
            "queries": {
                "get": {
                    args: ["section", "titile", "link", "updated"],
                    types: ["Enum(opinions,world_news)", "String", "Entity(tt:url)", "Boolean"],
                    required: [true, false, false, false],
                    is_input: [true, false, false, false]
                }
            }
        },
        "uber": {
            "queries": {
                "get_price_estimate": {
                    args: ["start", "end", "estimate"],
                    types: ["Location","Location","Currency"],
                    required: [true,true,false],
                    is_input: [true,true,false]
                }
            }
        },
        "com.live.onedrive": {
            "actions": {},
            "queries": {
                "list_files": {
                    args: ["file_name", "description"],
                    types: ["Entity(tt:path_name)", "String"],
                    required: [false, false],
                    is_input: [false, false]
                }
            }
        },
        "com.bing": {
            "actions": {},
            "queries": {
                "web_search": {
                    args: ["query", "title", "description"],
                    types: ["String", "String", "String"],
                    required: [true, false, false],
                    is_input: [true, false, false]
                }
            }
        },
    },

    getSchemas: function() {
        return this._schema;
    },

    getMetas: function() {
        return this._meta;
    }
};
