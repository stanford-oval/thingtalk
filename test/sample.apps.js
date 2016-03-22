// -* mode: js -*-

function MultiAction() {
    var v1 = "foo", v2 = 7;

    $logger("bla");
}

function RandomTest2() {
    $logger([1,2,3].choice().toString());
}

function TestOpOrder() {
    $('sabrina').say(5-2+1);
}

function TestNumber() {
    var Num = -1.2e7;
    var Mes = 1.5;
}

function MultiparamRegex() {
    $('sabrina').listen((foo) => {
        var match = /([0-9]+) ([0-9]+)/.exec(foo);
        if (match)
            $logger(match[1] + " " + match[2]);
    });
}

function TwitterHourlyCount() {
    var TweetCount = 0;

    $timer(3600*1000, () => {
        TweetCount = 0;
    });

    $('twitter').source((text, hashtags, urls, from, inReplyTo, yours) => {
        if (!yours)
            TweetCount++;
    });

    $timer(3600*1000, () => {
        $notify("Your Twitter feed has " + TweetCount + " new tweets in the past hour");
    });
}

function CompareTest() {
    var V1, V2;

    $timer(10000, () => {
        if (V1 - V2 < 3)
            $notify("foo");
    });
}

function TrueTest() {
    $logger("something");
}

function RandomTest() {
    $logger(Math.random());
}

function KeywordTest() {
    var Key1, Key2;

    $timer(30000, () => {
        if (Key1 == "foo")
            Key1 = Key2;
    }
}


TwitterTrendingHashtag(NumberOfUsers : Number) {
var HashTagToUser : Map(String, Array(String));

!HashTagToUser(_) => HashTagToUser($emptyMap());

@$timer(1day) => HashTagToUser($emptyMap());

@twitter.source(_, hashtags, _, from, _, false),
HashTagToUser(dict), $contains(hashtags, tag), users = $lookup(dict, tag),
!$contains(users, from) =>
HashTagToUser($insert(dict, tag, $append(users, from)));

@$timer(1h), HashTagToUser(dict), $contains(dict, tag), $count($lookup(dict, tag)) >= NumberOfUsers =>
@$notify(tag + " is a trending hashtag today");

}

LinkedInApp-F () {
var Company-F : (String, String);
out Colleagues : Array((String, String));
var NewColleague : (String, String);
@linkedin.profile (name, co) =>Company-F[self](name, co);
Company-F[self](_,co), Company-F[m](name, co), m in F, m != self =>NewColleague(name, co);
NewColleague(name, co) => Colleagues($append(Colleagues, (name, co)));
NewColleague(name, co) => @$notify(name);
}


ParserTest() {
@sabrina.listen(text), $regex("^on\\s+hashtag\\s+([a-z0-9]+)", 42 = !!false && 7) => Val(42);
}


SabrinaTestCapturingGroup() {
@sabrina.listen(text), $regex(text, "^on\\s+hashtag\\s+([a-z0-9]+)", "i", hashtag)
    => @sabrina.say("hashtag " + hashtag);
}



LinkedInApp-F() {
    var Company-F : (String, String);
    var NewColleague : (String, String);

    @linkedin.profile(name, _, ind) => Company-F[self](name, ind);
    Company-F[self](_, ind), Company-F[m](name, ind), m in F =>
        NewColleague(name, ind);
    NewColleague(name, co) => @$notify(name, co);
}



WeightCompetition-F(stopTime: String) {
    var InitialWeight-F : (Measure(kg));
    var Weight : (Measure(kg));
    var Loss-F : (Number);
    var Winner : (User);

    @(type="scale").source(_, w)
        => Weight(w);

    Weight(w), !InitialWeight-F[self](_)
        => InitialWeight-F[self](w);

    InitialWeight-F[self](w1), Weight(w2)
        => Loss-F[self]((w1 - w2)/w2);

    Loss-F[m](l), m in F
        => Winner($argMax(Loss-F));

    Winner(w)
        => @$notify(w);

    @$at(stopTime)
        => @$return(Winner);
}



TestComputeApp() {
    module random {
        event out(x : Number);
        function ask() {
            out(Math.floor(42 + Math.random() * 42));
        }
    }

    @$timer(30s) => @random.ask();
    @random.out(x) => @$logger('number: ' + $toString(x));
}


/* This should not run directly, but it gives an idea of the syntax */
/* They should all at least parse successfully. */

Test() {
    @test.source() => @$logger("Test App received an event on Test Channel");
}
