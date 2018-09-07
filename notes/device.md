# Device Class
A ThingTalk class represents a device in Thingpedia. 
It's interface definition is composed of 
- entity types: user-defined types
- queries: idempotent functions 
- actions: functions with side-effect

## Queries
Queries are declared as    
`[monitorable]? [list|maybe]? query <query-name>([[in req | in opt | out ] <param-name> : <type>]*);`
- `monitorable` means the query is deterministic and can be monitored for changes
- `list` query returns 0 or more results, `maybe` query returns 0 or 1 results, default query returns exactly 1 result when both `list` and `maybe` are omitted.

## Actions
Actions return no results, thus cannot have output parameters.
The are declared as:   
`action <action-name> ([[in req | in opt ] <param-name> : <type>]*);`

## Annotations
All annotations come after the corresponding code.
Natural language related annotations (which should be translatable) are described with syntax `#_[]`,
while implementation annotations use `#[]`.

Each query or action needs at least two natural language annotation: `canonical` and `confirmation`. 
Example `utterances` can also be supplied here (alternatively can be supplied in dataset file).

Monitorable queries requires implementation annotation `poll_interval`.

Each parameter in query or action can optionally have `prompt` annotation to provide slot filling questions.
If omitted, we will simply ask `what's the value of  \<param-name\>?`, or use the prompt from the method it used 
if it's implemented in ThingTalk.

## Configuration and Authentication
```java
mixin @org.thingpedia.config.form(in req params : ArgMap);
mixin @org.thingpedia.config.basic_auth(in opt extra_params : ArgMap); 
mixin @org.thingpedia.config.custom_oauth(...);
mixin @org.thingpedia.config.oauth2(in req client_id : String, in req client_secret : String, in opt authorize : Entity(tt:url), );
mixin @org.thingpedia.config.discovery(in req protocol : Entity(tt:discovery_protocol));
mixin @org.thingpedia.config.none(...);

// in device class
import config from @org.thingpedia.config.form(params=makeArgMap(url: String, ));
import config from @org.thingpedia.config.basic_auth(extra_params={serial_number= String});
import config from @org.thingpedia.config.custom_oauth();
import config from @org.thingpedia.config.oauth2(client_id=..., client_secret=..., authorize="http://example.com", );
import config from @org.thingpedia.config.discovery(protocol="upnp");
import config from @org.thingpedia.config.none(api_key="foobar");
```

## Twitter as an Example
```java
class @com.twitter {
    import loader from @org.thingpedia.v2();
    import config from @org.thingpedia.config.custom_oauth();

    entity id;
    
    monitorable list query direct_messages(
        out sender : Entity(tt:username), 
        out message : String
    )
    #_[canonical='get direct message on twitter']
    #_[confirmation='get direct message on twitter']
    #[poll_interval=10min];

    action send_direct_message(
        in req to : Entity(tt:username) #_[prompt='who do you want to send the message to?'],
        in req message : String #_[prompt='what do you want to send?']
    )
    #_[canonical='send direct message on twitter']
    #_[confirmation='send direct message to ${to} saying ${message} on twitter'];


    // a query or action can also be implemented in ThingTalk directly 
    // where `this` can be used as a shorthand for device kind (i.e., @com.twitter in this case)
    action auto_reply(
        in req message: String #_[prompt='what do you want to reply?']
    ) := this.direct_messages() => this.send_direct_message(to=sender, message=message) 
    #_[canonical='auto reply on twitter']
    #_[confirmation='auto reply $message on twitter'];
}
