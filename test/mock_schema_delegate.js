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
                    is_list: false,
                    is_monitorable: false,
                }
            },
            "actions": {
                "say" : {
                    args: ["message"],
                    types: ["String"],
                    required: [true],
                    is_input: [true],
                    is_list: false,
                    is_monitorable: false,
                },
                "debug_log": {
                    args: ["message"],
                    types: ["String"],
                    required: [true],
                    is_input: [true],
                    is_list: false,
                    is_monitorable: false,
                }
            }
        },
        "security-camera": {
            "queries": {
                "current_event": {
                    args: ["start_time", "has_sound", "has_motion", "has_person", "picture_url"],
                    types: ["Date", "Boolean", "Boolean", "Boolean", "Picture"],
                    required: [false,false,false,false,false],
                    is_input: [false,false,false,false,false],
                    is_list: false,
                    is_monitorable: true,
                },
                "get_snapshot": {
                    args: ["picture_url"],
                    types: ["Picture"],
                    required: [false],
                    is_input: [false],
                    is_list: false,
                    is_monitorable: false,
                }
            },
            "actions": {
                "set_power": {
                    args: ["power"],
                    types: ["Enum(on,off)"],
                    required: [true],
                    is_input: [true],
                    is_list: false,
                    is_monitorable: false,
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
                    is_list: true,
                    is_monitorable: true,
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
                    is_list: false,
                    is_monitorable: false,
                }
            },
            "queries": {
                "receive_sms": {
                    args: ["from", "body"],
                    types: ["Entity(tt:phone_number)", "String"],
                    required: [false,false],
                    is_input: [false,false],
                    is_list: true,
                    is_monitorable: true,
                },
                "get_gps": {
                    args: ["location"],
                    types: ["Location"],
                    required: [false],
                    is_input: [false],
                    is_list: false,
                    is_monitorable: true,
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
                    is_list: false,
                    is_monitorable: true,
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
                    is_list: false,
                    is_monitorable: false,
                },
                "post_picture": {
                    args: ["caption", "picture_url"],
                    types: ["String", "Entity(tt:picture)"],
                    required: [true,true],
                    is_input: [true,true],
                    is_list: false,
                    is_monitorable: false,
                }
            },
            "queries": {
                "source": {
                    args: ["text", "hashtags", "urls", "from", "inReplyTo", "__reserved"],
                    types: ["String","Array(Entity(tt:hashtag))","Array(String)","String","String","Boolean"],
                    required: [false,false,false,false,false,false],
                    is_input: [false,false,false,false,false,false],
                    is_list: true,
                    is_monitorable: true,
                },
                "search": {
                    args: ["query", "text", "hashtags", "urls", "from", "inReplyTo"],
                    types: ["String", "String","Array(String)","Array(String)","String","String"],
                    required: [true, false,false,false,false,false],
                    is_input: [true, false,false,false,false,false],
                    is_list: true,
                    is_monitorable: true,
                },
                "my_tweets": {
                    args: ["text", "hashtags", "urls", "in_reply_to", "tweet_id"],
                    types: ["String", "Array(Hashtag)", "Array(URL)", "Username", "String"],
                    required: [false, false, false, false, false],
                    is_input: [false, false, false, false, false],
                    is_list: true,
                    is_monitorable: true,
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
                    is_list: true,
                    is_monitorable: true,
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
                    is_list: true,
                    is_monitorable: true,
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
                    is_list: false,
                    is_monitorable: true,
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
                    is_list: false,
                    is_monitorable: false,
                }
            },
            "queries": {
                "get_temperature": {
                    args: ["time", "temperature"],
                    types: ["Date", "Measure(C)"],
                    required: [false,false],
                    is_input: [false,false],
                    is_list: false,
                    is_monitorable: true,
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
                    is_list: false,
                    is_monitorable: true,
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
                    is_list: false,
                    is_monitorable: true,
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
                    is_input: [false, false],
                    is_list: true,
                    is_monitorable: true,
                }
            }
        },
        "yandex": {
            "queries": {
                "translate": {
                    args: ["source_language", "target_language", "text", "translated_text"],
                    types: ["Entity(tt:iso_lang_code)", "Entity(tt:iso_lang_code)", "String", "String"],
                    required: [false, true, true, false],
                    is_input: [true, true, true, false],
                    is_list: false,
                    is_monitorable: false,
                }
            }
        },
        "wsj": {
            "queries": {
                "get": {
                    args: ["section", "titile", "link", "updated"],
                    types: ["Enum(opinions,world_news)", "String", "Entity(tt:url)", "Boolean"],
                    required: [true, false, false, false],
                    is_input: [true, false, false, false],
                    is_list: true,
                    is_monitorable: true,
                }
            }
        },
        "uber": {
            "queries": {
                "get_price_estimate": {
                    args: ["start", "end", "estimate"],
                    types: ["Location","Location","Currency"],
                    required: [true,true,false],
                    is_input: [true,true,false],
                    is_list: false,
                    is_monitorable: true,
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
                    is_input: [false, false],
                    is_list: true,
                    is_monitorable: true,
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
                    is_input: [true, false, false],
                    is_list: true,
                    is_monitorable: true,
                }
            }
        },
        "com.thecatapi": {
            "actions": {},
            "queries": {
                "get": {
                    args: ["image_id", "count", "picture_url", "link"],
                    types: ["Entity(com.thecatapi:image_id)", "Number", "Picture", "URL"],
                    required: [false, false, false, false],
                    is_input: [false, true, false, false],
                    is_list: false,
                    is_monitorable: false,
                }
            }
        },
        "com.gmail": {
            "actions": {
                "send_picture": {
                    // in req to : EmailAddress, in req subject : String, in req message : String, in req picture_url : Picture
                    args: ["to", "subject", "message", "picture_url"],
                    types: ["EmailAddress", "String", "String", "Picture"],
                    required: [true, true, true, true],
                    is_input: [true, true, true, true],
                    is_list: false,
                    is_monitorable: false,
                }
            },
            "queries": {
                "inbox": {
                    // out sender_name : String, out sender_address : EmailAddress, out subject : String, out date : Date, out labels : Array(String), out snippet : String, out thread_id : Entity(com.gmail:thread_id), out email_id : Entity(com.gmail:email_id), in opt is_important : Boolean, in opt is_primary : Boolean
                    args: ["sender_name", "sender_address", "subject", "date", "labels", "snippet", "thread_id", "email_id", "is_important", "is_primary"],
                    types: ["String", "EmailAddress", "String", "Date", "Array(String)", "String", "Entity(com.gmail:thread_id)", "Entity(com.gmail:email_id)", "Boolean", "Boolean"],
                    required: [false, false, false, false, false, false, false, false, false, false],
                    is_input: [false, false, false, false, false, false, false, false, true, true],
                    is_list: true,
                    is_monitorable: true,
                }
            }
        }
    },

    getSchemas: function() {
        return this._schema;
    },

    getMetas: function() {
        return this._meta;
    }
};
