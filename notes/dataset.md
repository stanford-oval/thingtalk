# Dataset
Dataset should stand on its own. Snippets or functions declared inside should stay inside.

```java
// dataset @com.twitter will be the default dataset for device twitter 
// other dataset uses twitter only can be named as @com.twitter.xxx
// 'en' will be the default language, thus `language 'en'` can be omitted
dataset @com.twitter language 'en' {
    query () := @com.twitter.direct_messages()
    #_[utterances=["my direct messages", "my twitter dms"]];

    query (p_sender : Entity(tt:username)) := @com.twitter.direct_messages(), sender == p_sender
    #_[utterances=["direct messages from $p_sender", "twitter dms from ${p_sender}"]];

    query tweets_from_someone (
        in req p_author : Entity(tt:username)
    ) := @com.twitter.search(), author == p_author
    #_[utterances=[
        'tweets from $p_author'
    ]];

    // i kind of want to omit the `_`, it looks ugly
    stream (
        in req p_author : Entity(tt:username)
    ) := monitor (@com.twitter.search()) author == p_author
    #_[utterances=[
        'when $p_author tweets'
    ]];

    program (
        in req p_author : Entity(tt:username)
    ) := monitor (@com.twitter.search()) author == p_author => notify
    #_[utterances=[
        'notify me when $p_author tweets',
        'monitor $p_author\'s tweets'
    ]]
;}

thingpedia @com.twitter.everything {
    import class @com.twitter;
    import dataset @org.thingpedia.turking4;
}

thingpedia @org.thingpedia.everything {
    import class *;
    import dataset @org.thingpedia.turking4;
    import dataset @org.thingpedia.turking6;
}

thingpedia @org.thingpedia.snap6 {
    import class * #[snapshot=6];
    import dataset @org.thingpedia.turking4;
    import dataset @org.thingpedia.turking6;
}

// https://almond-nl.stanford.edu/en-US/org.thingpedia.everything/query?q=tweet+hello
// https://almond-nl.stanford.edu/en-US/org.twitter/query?q=tweet+hello

```