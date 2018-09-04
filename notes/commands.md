# Commandpedia
Third-parties can contribute new functions written in ThingTalk which will be stored in commandpedia.
We probably want the approval mechanism as for new devices and enable auto training for this.

Each function can optionally have its own confirmation, and prompts for each parameter; 
but must have canonical and utterances. 
If omitted, confirmation will be auto-generated based on the primitives used, and prompts 
will be the same as the ones in the primitives.

Different from dataset, the output parameters needs to be specified.
```java
let query tweets_from_someone (
    in req p_author : Entity(tt:username),
    out tweets: String
) := @com.twitter.search(), author == p_author;
#_[canonical='tweets from someone']
#_[confirmation='tweets from $p_author']
#_[utterances=[
    'tweets from $p_author'
]])

let stream all_posts_from_someone (
    in req p_author : Entity(tt:username) #_[prompt='whose tweets do you want to get?'],
    out post : String
) := 
    [tweets as post] of monitor (@com.twitter.search(), author == p_author))
    union 
    monitor (@com.facebook.timeline(), author == p_author));
#_[canonical='all posts from someone']
#_[confirmation='all posts from $p_author']
#_[utterances=[
    'all posts from $p_author'
]])

let program morning_routine := {
    monitor @com.yahoo.finance.get_price('fb') => notify;
    monitor @org.bitcoin.get_price() => notify;
    now => @org.thingpedia.weather() => notify;
    now => @com.starbucks.order() => notify;
}
#_[utterances=[
    'morning routine'
]])
```