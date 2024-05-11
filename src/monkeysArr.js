const monkeysArr = [
    {
        name: "Wanda",
        troop: "H&B",
        sex: "female",
        year: 2023,
        chip: 41188,
        img: [
            "https://i.ibb.co/hKkLRhs/wanda-hb-mar2024.jpg",
            "https://i.ibb.co/kcB1qG5/wanda-hb-apr2024.jpg",
            "https://i.ibb.co/CJ25F3s/wanda-hb-apr2024-2.jpg",
        ],
        bio: "Arrived as an orphan in Dec 2023. Started foster-mum integration at Goliath but didn't bond with mums and was moved to H&B with Bluebell. Fostered by Skylar.",
    },
    {
        name: "Yoda",
        troop: "Koko",
        sex: "male",
        year: 2023,
        chip: 41192,
        img: ["https://i.ibb.co/s1zM2FL/yoda-koko-feb2024-2.jpg"],
        bio: "Arrived as an orphan in Nov 2023. Found in the slurry river of a mine in Phalaboraw. Handed over to CARE who brought to us. Fostered by Karla.",
    },
    {
        name: "Timmy",
        troop: "Gismo",
        sex: "male",
        year: 2023,
        chip: 41197,
        img: ["https://i.ibb.co/k3q8XXr/timmy-gismo-mar2024.jpg"],
        bio: "Arrived as an orphan in Dec 2023 at approx 3 months old. Was kept as a pet for at least 2 months and came wearing a nappy. Bought from a seller on the side of the road and kept in the family home. Very attached to people and his bottle. Fed cows milk. Fostered by Uh-Oh.",
    },
    {
        name: "Riccardo",
        troop: "Koko",
        sex: "male",
        year: 2023,
        chip: 26665,
        img: ["https://i.ibb.co/hX8Zs3c/riccardo-koko-mar2024.jpg"],
        bio: "Arrived as an orphan in Oct 2023. History unknown, was handed in to a vet in Polokwane and then brought to us by Whelmi. Fostered by Panacur.",
    },
    {
        name: "Atlas",
        troop: "Koko",
        sex: "male",
        year: 2023,
        chip: 26609,
        img: ["https://i.ibb.co/xD4brFX/atlas-koko-feb2024.jpg"],
        bio: "Arrived as an orphan in Oct 2023. Mother was shot by a farmer. Fostered by Yllena.",
    },
    {
        name: "TK",
        troop: "Skunkey",
        sex: "female",
        year: 2023,
        chip: 41179,
        img: ["https://i.ibb.co/jJCSQdx/tk-skunkey-mar2024.jpg"],
        bio: "Arrived as an orphan in Oct 2023. Was confiscated by the SPCA in The Free State, no further history known. Very scabby on face, head and neck on arrival. Fostered by Martha.",
    },
    {
        name: "Samber",
        troop: "Koko",
        sex: "male",
        year: 2023,
        chip: 41181,
        img: ["https://i.ibb.co/Xy8Pn6y/samber-koko-mar2024.jpg"],
        bio: "Arrived as an orphan in Nov 2023. History unknown, was at Chimp Eden for a week before arrival at VMF. Arrived with suspected case of ringworm. Fostered by Kara.",
    },
    {
        name: "Paulie",
        troop: "H&B",
        sex: "male",
        year: 2023,
        chip: 41192,
        img: ["https://i.ibb.co/d26Jdcb/paulie-hb-mar2024-2.jpg"],
        bio: "Arrived as an orphan in Nov 2023. Was found alone, wet and shivering, at a storage shed at Magoesbaskloof Adventures. History unknown. Arrived with 5-6 ticks, crusty/muddy face and bruised left eye. Very close bond with Mikey. Fostered by Millie.",
    },
    {
        name: "Nugget",
        troop: "Goliath",
        sex: "male",
        year: 2023,
        chip: 41186,
        img: ["https://i.ibb.co/vzbDSLK/nugget-goliath-mar2024-2.jpg"],
        bio: "Arrived as an orphan in Dec 2023. Was confiscated by SPCA after being kept as a pet for at least 5 days and handed over to Beyond Borders Sanctuary in Tzaneen. History unknown. Fostered by Ellie.",
    },
    {
        name: "Wiz",
        troop: "Goliath",
        sex: "female",
        year: 2023,
        chip: 41220,
        img: ["https://i.ibb.co/m0tjhzm/wiz-goliath-apr2024.jpg"],
        bio: "Mother was Fluffy Witch, an elderly member of the Bandits, who passed away in Apr 2024 when Wiz was only 4 months old. Due to lack of bond with the other bandits, she was taken in as an orphan. Fostered by Mrs Gold.",
    },
    {
        name: "Mary Sunshine",
        troop: "Goliath",
        sex: "female",
        year: 2023,
        chip: 0,
        img: ["https://i.ibb.co/1bkzt5L/marysunshine-goliath-feb2024.jpg"],
        bio: "Born in troop in Nov 2023 to Maggie Mae.",
    },
    {
        name: "Lochlan",
        troop: "Royal",
        sex: "female",
        year: 2023,
        chip: 0,
        img: ["https://i.ibb.co/jLS22sC/lochlan-royal-apr2024.jpg"],
        bio: "Born in troop in Oct 2023 to Butter.",
    },
    {
        name: "Kathleen",
        troop: "H&B",
        sex: "female",
        year: 2023,
        chip: 41183,
        img: ["https://i.ibb.co/XZXhgdQ/kathleen-hb-mar2024-2.jpg"],
        bio: "Arrived as an orphan in Nov 2023. Was found alone in a tree following a troop fight in a nature reserve near Gravelot. Said to have been there all day screaming, troop did not return so was taken in and handed over. Fostered by Percy.",
    },
    {
        name: "June",
        troop: "Global",
        sex: "female",
        year: 2023,
        chip: 41196,
        img: ["https://i.ibb.co/7jcS8Fp/june-global-mar2024-2.jpg"],
        bio: "Arrived as an orphan in Nov 2023. Was being sold to a vet in Louis Trichardt who then called us. Fostered by Meghan.",
    },
    {
        name: "Harold",
        troop: "D&D",
        sex: "male",
        year: 2023,
        chip: 41222,
        img: ["https://i.ibb.co/PrqtB6n/harold-dd-apr2024.jpg"],
        bio: "Arrived as an orphan in Feb 2024. Found alone on a farm in the Free State. Fostered by Chane.",
    },
    {
        name: "Fritzi",
        troop: "Engeltjie",
        sex: "female",
        year: 2023,
        chip: 41221,
        img: ["https://i.ibb.co/hyRQNQ2/fritzi-engeltjie-mar204-2.jpg"],
        bio: "Arrived as an orphan in Dec 2023. Was found on a veranda alone in Tzaneen and handed in to Serala Animal Clinic. Was covered in blood and severely dehydrated, so was immediately put on a drip. Fostered by Aer.",
    },
    {
        name: "Elora",
        troop: "Skunkey",
        sex: "female",
        year: 2023,
        chip: 41180,
        img: ["https://i.ibb.co/C130wG9/elora-skunkey-mar2024-2.jpg"],
        bio: "Arrived as an orphan in Oct 2023. Mother was killed by a car. Took longer to release her than the others, but eventually went out with Jambi.",
    },
    {
        name: "Darby",
        troop: "James",
        sex: "male",
        year: 2023,
        chip: 41200,
        img: ["https://i.ibb.co/JCCYGjL/darby-james-feb2024-2.jpg"],
        bio: "Arrived as an orphan in Oct 2023. Was found in some municipality offices in Nelspurit, spent the weekend there with no food or water, quite dehyrdated on arrival. Had a healing break or dislocation on right elbow which delayed his move to foster-mums. Fostered by Litchie.",
    },
    {
        name: "Anita",
        troop: "Skunkey",
        sex: "female",
        year: 2023,
        chip: 41185,
        img: ["https://i.ibb.co/JFD3PyW/anita-skunkey-mar2024-2.jpg"],
        bio: "Arrived as an orphan in Oct 2023. Mother was shot in Lepahale a day before being picked up. Fostered by Pan.",
    },
    {
        name: "Rowan",
        troop: "Goliath",
        sex: "male",
        year: 2023,
        chip: 41184,
        img: ["https://i.ibb.co/Sn78j7j/rowan-goliath-mar2024.jpg"],
        bio: "Arrived as an orphan in Nov 2023. Fostered by Mrs Gold.",
    },
    {
        name: "Tufty",
        troop: "H&B",
        sex: "female",
        year: 2023,
        chip: 41182,
        img: ["https://i.ibb.co/8Dnpp0Y/tufty-hb-apr2024-2.jpg"],
        bio: "Arrived as an orphan in Nov 2023. Fostered by Millie.",
    },
    {
        name: "Bluebell",
        troop: "H&B",
        sex: "female",
        year: 2023,
        chip: 41187,
        img: ["https://i.ibb.co/j43tkx7/bluebell-hb-apr2024.jpg"],
        bio: "Arrived as an orphan in Dec 2023 at approx 10 weeks old. Started foster-mum integration at Goliath but didn't bond with mums and was moved to H&B with Wanda. Fostered by Skylar.",
    },
    {
        name: "Mikey",
        troop: "H&B",
        sex: "male",
        year: 2023,
        chip: 41193,
        img: ["https://i.ibb.co/rQ9mJN7/mikey-hb-feb2024.jpg"],
        bio: "Arrived as an orphan in Nov 2023. Was inseparably from Paulie before release. Fostered by Millie.",
    },
    {
        name: "Mia",
        troop: "D&D",
        sex: "female",
        year: 2023,
        chip: 41211,
        img: ["https://i.ibb.co/ZBw3DfT/mia-dd-mar2024.jpg"],
        bio: "Arrived as an orphan in Jan 2024. History unknown but was kept as a pet for at least a month before handing over. Fostered by Hazel.",
    },
    {
        name: "Ildiko",
        troop: "D&D",
        sex: "female",
        year: 2023,
        chip: 41217,
        img: ["https://i.ibb.co/jw7bC76/ildiko-dd-apr2024.jpg"],
        bio: "Arrived as an orphan in Feb 2024. Mother was killed by a car and Ildiko was brought to Moholoholo Widlife Centre. Fostered by Hazel.",
    },
    {
        name: "Remy",
        troop: "Engeltjie",
        sex: "male",
        year: 2023,
        chip: 41195,
        img: ["https://i.ibb.co/Q90b47c/remy-engeltjie-may2024.jpg"],
        bio: "Arrived as an orphan in Nov 2023. History unknown, was with Samber at Chimp Eden for a few days before coming to VMF. Arrived with broken left arm which delayed his move to foster-mums. Integrated with Duimpie as a soft-release due to lack of bond to foster-mums, although often looked after by Gladys.",
    },
    {
        name: "Duimpie",
        troop: "Engeltjie",
        sex: "female",
        year: 2023,
        chip: 41225,
        img: ["https://i.ibb.co/chtSfPC/duimpie-engeltjie-apr2024-temp.jpg"],
        bio: "Arrived as an orphan in Dec 2023. Mother was killed by dogs and Duimpie was then kept as a pet for 3 months. Integrated with Remy as a soft-release due to lack of bond to foster-mums, although often looked after by Gladys",
    },
    {
        name: "Lyyti",
        troop: "Global",
        sex: "female",
        year: 2023,
        chip: 41178,
        img: ["https://i.ibb.co/J35734k/lyyti-global-feb2024.jpg"],
        bio: "Arrived as an orphan in Nov 2024. Was found on a veranda in Haenertsburg alone and crying for at least 12 hours. Scabby face on arrival. Fostered by Meghan.",
    },
    {
        name: "Bugaloo",
        troop: "Bandits",
        sex: "male",
        year: 2023,
        chip: 41190,
        img: ["https://i.ibb.co/RzMJ63S/bugaloo-bandits-mar2024.jpg"],
        bio: "Arrived as an orphan in Nov 2023. Mother was electrocuted in Hoedspruit. Was integrated into Skunkey troop but went missing after a week, was then found several days later being carried by adult female Eyebrows in the bandit troop. They seemed to have established a close bond",
    },
    {
        name: "Trixi",
        troop: "SAAV",
        sex: "female",
        year: 2023,
        chip: 41218,
        img: ["https://i.ibb.co/t4B6Brv/trixi-saav-apr2024.jpg"],
        bio: "Arrived as an orphan in Mar 2024.Was found on deceased mother's body by workers on a farm, cold and dehydrated. Kept my owners wife for four days prior to arrival at VMF. Fostered by Acorn, but mostly with Dabney in troop.",
    },
    {
        name: "Harris",
        troop: "SAAV",
        sex: "male",
        year: 2023,
        chip: 41219,
        img: ["https://i.ibb.co/rtKmkfc/harris-saav-apr2024.jpg"],
        bio: "Arrived as an orphan in Mar 2024. History unknown, but was kept as a pet for at least 2 months. Fostered by Acorn.",
    },
    {
        name: "Zoro",
        troop: "Goliath",
        sex: "male",
        year: 2016,
        chip: 21468,
        img: ["https://i.ibb.co/LrPbPKj/Zoro-Goliath-Feb-2024-min.jpg"],
        bio: "Arrived as an orphan. Fostered by Mrs Gold.",
        desc: "Big round eyes, very fluffy especially around the head.",
    },
    {
        name: "Foxy",
        troop: "Goliath",
        sex: "female",
        year: 2018,
        chip: 21575,
        img: ["https://i.ibb.co/1qHd37p/Foxy-Goliath-Mar-2023-2-min.jpg"],
        bio: "Arrived an orphan. Mother was hit and killed by a car. Fostered by Mrs Gold. History of regularly juming in and out of enclosure.",
        desc: "Flashes above eyes and some silhouettes below as well, nervous of people, will eyebrow and head-bob if stared at.",
    },
    {
        name: "Grover",
        troop: "Goliath",
        sex: "male",
        year: 2022,
        chip: 26627,
        img: ["https://i.ibb.co/tD3yJvn/Grover-Golith-21-02-2024-1-min.jpg"],
        bio: "Arrived as an orphan from Johannesburg wildlife vet along with Sophie. Mother was shot. Fostered by Mrs Gold and then by Dad & Bliss once in troop. ",
        desc: "Round head, straight brow",
    },
    {
        name: "Sophie",
        troop: "Goliath",
        sex: "female",
        year: 2022,
        chip: 26623,
        img: ["https://i.ibb.co/0fvw8h4/Sophie-Goliath-Aug-23-5-min.jpg"],
        bio: "Arrived as an orphan from Johannesburg wildlife vet along with Grover. Mother was shot. Fostered by Mrs Gold and then by Dad & Bliss once in troop. ",
        desc: "Grumpy expression, M-shaped brow with peak on the middle",
    },
    {
        name: "Amy",
        troop: "Goliath",
        sex: "female",
        year: 2013,
        chip: 1223,
        img: ["https://i.ibb.co/gWsVzqs/Amy-Goliath-Sept-2023-min.jpg"],
        bio: "Arrived as an orphan. Found alone on a game reserve.",
        desc: "Quite small, very pointy face",
    },
    {
        name: "Angelica",
        troop: "Goliath",
        sex: "female",
        year: 2008,
        chip: 1218,
        img: ["https://i.ibb.co/gjGLy2d/Angelica-Goliath-Apr-2023-min.jpg"],
        bio: "Born in troop to Camilla (deceased). Has misaligned jaw, reason unknown but most likely genetic.",
        desc: "Distinctive misaligned jaw, short tail missing black tip, very light-grey scruffy coat",
    },
    {
        name: "Aurora",
        troop: "Goliath",
        sex: "female",
        year: 2020,
        chip: 26789,
        img: ["https://i.ibb.co/C56JTVq/Aurora-Goliath-Apr-2023-2-min.jpg"],
        bio: "Arrived as an orphan. Was found being sold on the side of the road for R100. ",
    },
    {
        name: "Bliss",
        troop: "Goliath",
        sex: "female",
        year: 2010,
        chip: 1461,
        img: ["https://i.ibb.co/cvYxPmS/Bliss-Goliath-Apr-2023-2-min.jpg"],
        bio: "Born in troop to Schlinkey.",
        desc: "Grumpy face, tail bent is various parts, missing black tip, looks quite similar to her sister Dad.",
    },
    {
        name: "Boetie ",
        troop: "Goliath",
        sex: "male",
        year: 2013,
        chip: 1013,
        img: ["https://i.ibb.co/2YvYtBJ/blank-image-min.jpg"],
        bio: "Arrived as an adult. Found along and kept as a pet for month before handing in. ",
        desc: "Smaller adult male, light golden coat",
    },
    {
        name: "Claudette Marie",
        troop: "Goliath",
        sex: "female",
        year: 2021,
        chip: 26656,
        img: [
            "https://i.ibb.co/zFJTBS8/Claudette-Marie-Goliath-Apr-2023-3-min.jpg",
        ],
        bio: "Arrived as an orphan. Mother was shot and she she arrived with a wound on her arm. Fostered by Mrs Gold, also spent some time with Maggie Mae.",
    },
    {
        name: "Dad",
        troop: "Goliath",
        sex: "female",
        year: 2009,
        chip: 1279,
        img: ["https://i.ibb.co/Zg1FdWb/Dad-Goliath-Apr-2023-min.jpg"],
        bio: "Alpha-female. Born in troop to Schlinkey. Fostered Keegie & Vader (after his mother Hartley passed away). Won’t come into introcage but will foster babies once they are in the troop.",
        desc: "Damaged tail tip due to injury, big fluffy head, scar on bottom lip, looks like her sister Bliss",
    },
    {
        name: "Dana",
        troop: "Goliath",
        sex: "female",
        year: 2016,
        chip: 1467,
        img: ["https://i.ibb.co/6DntSr0/Dana-Goliath-Apr-2023-min.jpg"],
        bio: "Arrived as an orphan, collected from Levubu. Fostered by Shortie (now deceased).",
        desc: "Borad flat nose, straight brow, can be difficult to find",
    },
    {
        name: "DD",
        troop: "Goliath",
        sex: "female",
        year: 2017,
        chip: 98268,
        img: ["https://i.ibb.co/jbm9KHH/DD-Goliath-Apr-2023-min.jpg"],
        bio: "Arrived as an orphan. Was found alone in the bathroom of a restaurant. Fostered by Mrs Gold.",
        desc: "Very cute square face, round eyes, distinctive peak in middle of brow, usually with the alpha-group",
    },
    {
        name: "Digit ",
        troop: "Goliath",
        sex: "female",
        year: 2014,
        chip: 1283,
        img: ["https://i.ibb.co/x5kLDFV/digit-goliath-feb2024-min.jpg"],
        bio: "Arrived as an orphan. Found stuck on a fence. Doesn’t like the introcage but is good with babies once they join the troop.",
        desc: "Long gently curved brow, very stocky, blad patch left side of head to due arrival injury",
    },
    {
        name: "Earl",
        troop: "Goliath",
        sex: "male",
        year: 2015,
        chip: 21531,
        img: ["https://i.ibb.co/WKRbRcK/earl-goliath-may2023-min.jpg"],
        bio: "Arrived as an orphan. Mother was hit and killed by a car. Fostered by Wilma (deceased).",
        desc: "Distinctive split across nose due to injury, dark grey coat",
    },
    {
        name: "Edson",
        troop: "Goliath",
        sex: "male",
        year: 2021,
        chip: 26769,
        img: ["https://i.ibb.co/Bsvy5Lk/edson-goliath-may2024-min.jpg"],
        bio: "Arrived as an orphan. Found alone on a nature reserve. Fostered by Mrs Gold and then taken by Yma when in troop.",
        desc: "",
    },
    {
        name: "Elio",
        troop: "Goliath",
        sex: "male",
        year: 2020,
        chip: 26543,
        img: ["https://i.ibb.co/8PPRtps/elio-goliath-apr2024-min.jpg"],
        bio: "Born out of season in June 2021 and arrived as an orphan in July. Found alone on the side of a road. Fostered by Maggie Mae.",
        desc: "Slight silhouettes with lines under eyes, flared nostrils, looks simialr to Fritz but smaller and not as golden.",
    },
    {
        name: "Ellie",
        troop: "Goliath",
        sex: "female",
        year: 2019,
        chip: 26782,
        img: ["https://i.ibb.co/1TvG8GB/ellie-goliath-april2023-min.jpg"],
        bio: "Arrived as an orphan. Found along on a game reserve, mother thought to have been killed by an eagle. Fostered by Mrs Gold. First time as a foster-mum in 2023/24, fostering Nugget.",
        desc: "Distinctive big sticky-out ears, quite slender, light-grey scruffy coat",
    },
    {
        name: "Fritz",
        troop: "Goliath",
        sex: "male",
        year: 2020,
        chip: 26718,
        img: ["https://i.ibb.co/ZXL0dRq/fritz-goliath-mar2024-min.jpg"],
        bio: "Arrived as an orphan. Found alone in a tool shed on a farm.",
        desc: "Wavy brow, nervous of people and will eyebrow when stared at",
    },
    {
        name: "Gandalf",
        troop: "Goliath",
        sex: "male",
        year: 2014,
        chip: 1231,
        img: ["https://i.ibb.co/fkDKwB3/gandalf-goliath-mar2022-min.jpg"],
        bio: "Arrived as an orphan. Fostered by Halo (deceased).",
        desc: "Narrow triangular-shaped dark face, parting on head, tail tip damaged due to injury",
    },
    {
        name: "Gavan",
        troop: "Goliath",
        sex: "male",
        year: 2015,
        chip: 19950,
        img: ["https://i.ibb.co/kqZq2rj/Gavan-Goliath-Feb-2023-min.jpg"],
        bio: "Arrived as an orphan. Fostered by Mrs Gold.",
        desc: "Very distinctive large silhouettes around eyes, golden caot",
    },
    {
        name: "Jerusalem",
        troop: "Goliath",
        sex: "female",
        year: 2017,
        chip: 19915,
        img: ["https://i.ibb.co/5KGX6LS/Jerusalem-Goliath-Apr-2023-min.jpg"],
        bio: "Arrived as an orphan. Mother was hit and killed by a car with Jerusalem suffering a broken foot. Fostered by Mrs Gold. Featured as the star of “The Dodo: Comeback Kids” video iw",
        desc: "Flat nose, small peak in middle of brow, quite fluffy",
    },
    {
        name: "Keegie",
        troop: "Goliath",
        sex: "female",
        year: 2014,
        chip: 1439,
        img: ["https://i.ibb.co/fqbQqJ5/Keegie-Goliath-May-2023-min.jpg"],
        bio: "Arrived as an orphan. Fostered by Dad.",
        desc: "Floppy left ear due to Waffles sucking on it when babies, high-ranked, usually with alpha-group",
    },
    {
        name: "Kimbo",
        troop: "Goliath",
        sex: "male",
        year: 2009,
        chip: 1411,
        img: ["https://i.ibb.co/vvtmr0Q/Kimbo-Goliath-Apr-2023-2-min.jpg"],
        bio: "Born in troop to Camilla (deceased). High-ranked.",
        desc: "Stocky fluffy adult, white lines under eyes, curved uneven brow, kink on tail",
    },
    {
        name: "Korigan",
        troop: "Goliath",
        sex: "male",
        year: 2015,
        chip: 20044,
        img: ["https://i.ibb.co/CzdVSLj/korigan-goliath-apr2023-min.jpg"],
        bio: "Arrived as an orphan. Fostered by Mrs Gold, taken by alpha-group once in troop.",
        desc: "Big, pointy ears, strong broad muzzle, slightly golden coat",
    },
    {
        name: "Lottie",
        troop: "Goliath",
        sex: "female",
        year: 2021,
        chip: 26729,
        img: ["https://i.ibb.co/j6ZR71r/lottie-goliath-apr2024-min.jpg"],
        bio: "Arrived as an orphan. Was found alone with mother under a caravan. Mother was possibly bitten by a snake and had passed away overnight. Fostered by Mrs Gold.",
        desc: "Distinctive patchy silhouettes around eyes, quite nervous of people",
    },
    {
        name: "Maddox",
        troop: "Goliath",
        sex: "male",
        year: 2019,
        chip: 26619,
        img: ["https://i.ibb.co/hdXpjdN/maddox-goliath-apr2024-min.jpg"],
        bio: "Arrived as an orphan with several minor cuts. Treated for a cloudy left eye before entering troop. Fostered by Mrs Gold.",
        desc: "Slight white lines under eyes.",
    },
    {
        name: "Maggie Mae",
        troop: "Goliath",
        sex: "female",
        year: 2016,
        chip: 1612,
        img: ["https://i.ibb.co/Pt26SPr/maggie-mar-april-2023-min.jpg"],
        bio: "Arrived as an orphan, collected from SPCA. Fostered by Mrs Gold, but was quite independent. Had a venereal tumour removed in early 2022. Fostered Elio, and mother of Mary Sunshine who was born in troop.",
    },
    {
        name: "Mandy",
        troop: "Goliath",
        sex: "female",
        year: 2007,
        chip: 1905,
        img: ["https://i.ibb.co/JcL7w9D/Mandy-Goliath-Apr-2023-min.jpg"],
        bio: "Born in troop to Sophia (deceased). Used to escape by climbing through the fence, but not recently. ",
        desc: "Back arches down when walking, dark grey coat, tear on right ear",
    },
    {
        name: "Marja-Liisa",
        troop: "Goliath",
        sex: "female",
        year: 2020,
        chip: 26773,
        img: ["https://i.ibb.co/m8D3wWR/marja-liisa-october-2023-min.jpg"],
        bio: "Arrived as an orphan. Mother was electrocuted on a pole.",
        desc: "No strong distinguishing features, quite slender and similar looking to Ellie.",
    },
    {
        name: "Max",
        troop: "Goliath",
        sex: "male",
        year: 2004,
        chip: 1674,
        img: ["https://i.ibb.co/smnsThP/max-goliath-may2024-min.jpg"],
        bio: "Arrived in group at 8 months old and lived in enclosure since it was first built. ",
        desc: "Very fluffy head, will readily headbob and eyebrow if looked at, small lump on base of scrotum",
    },
    {
        name: "Maysie",
        troop: "Goliath",
        sex: "female",
        year: 2018,
        chip: 21645,
        img: ["https://i.ibb.co/DKZ4k0c/maysie-goliath-apr2024-min.jpg"],
        bio: "Arrived as an orphan. Was found alone on a golf course in Mokopane. Fostered by Mrs Gold. Has a history of jumping out of enclosure with Foxy.",
        desc: "Small and slender, small peak in brow, often with the babies",
    },
    {
        name: "Mirabelle",
        troop: "Goliath",
        sex: "female",
        year: 2015,
        chip: 21512,
        img: ["https://i.ibb.co/7YxpVcb/Mirabelle-Goliath-May-2023-2-min.jpg"],
        bio: "Arrived as an orphan with pneumonia. Fostered by Shortie (deceased).",
        desc: "Light-grey scruffy coat, distinctive patchy silhouettes around eyes, low ranked",
    },
    {
        name: "Mrs Gold",
        troop: "Goliath",
        sex: "female",
        year: 2005,
        chip: 1516,
        img: ["https://i.ibb.co/cNDp4mR/mrs-gold-goliath-feb2024-min.jpg"],
        bio: "Was originally a bandit, but turned up in the troop one day. Mother of Vincent. Excellent foster-mum. Fostered Gavan, Zoro, Jerusalem, Joby, DD, Dana, Maysie, Foxy, Ellie, Sophie, Grover, Rowan, and Wiz",
        desc: "Golden often-wet hair on upper arms as she sucks on it a lot",
    },
    {
        name: "Mum",
        troop: "Goliath",
        sex: "female",
        year: 2009,
        chip: 1460,
        img: ["https://i.ibb.co/Rzyc3Jd/Mum-Goliath-May-2023-min.jpg"],
        bio: "Born in troop to alpha-female Hartley (deceased). Fostered Tarzan.",
        desc: "Very fluffy around the face, grumpy expression",
    },
    {
        name: "Nollie",
        troop: "Goliath",
        sex: "male",
        year: 2014,
        chip: 1257,
        img: ["https://i.ibb.co/LSDPmxW/Nollie-Goliath-June-2023-min.jpg"],
        bio: "Arrived as an orphan.",
        desc: "Large male, low curved brow, dark, face, slight overbite and often holds lips slightly open.",
    },
    {
        name: "Pepsi",
        troop: "Goliath",
        sex: "female",
        year: 2007,
        chip: 1682,
        img: ["https://i.ibb.co/HDQMt8j/Pepsi-Goliath-Apr-2023-min.jpg"],
        bio: "Born in troop to Schlinky",
        desc: "Left wrist bends to the side due to old break, confident with people and will follow along at fence line,",
    },
    {
        name: "Piglet",
        troop: "Goliath",
        sex: "female",
        year: 2014,
        chip: 1230,
        img: ["https://i.ibb.co/qMRHQsz/piglet-goliath-feb2024-min.jpg"],
        bio: "Arrived as an orphan.",
        desc: "Fluffy flat head, square ears, very cute looking",
    },
    {
        name: "Pippin",
        troop: "Goliath",
        sex: "male",
        year: 2014,
        chip: 1281,
        img: ["https://i.ibb.co/khxyxK8/Pippin-Goliath-Apr-2023-min.jpg"],
        bio: "Alpha-male. Arrived as an orphan. Fostered by Schlinky.",
        desc: "Large adult, very broad flat face",
    },
    {
        name: "Schlinkey",
        troop: "Goliath",
        sex: "female",
        year: 2004,
        chip: 1906,
        img: ["https://i.ibb.co/hgd4RYT/schlinkey-goliath-setp2021-min.jpg"],
        bio: "Arrived in a group at 8 months old, was abused.  Mother of Pepsi, Dad, Bliss. Fostered Pippin.",
        desc: "Large stocky adult, small tear top of right ear, thick tail which is missing the black tip",
    },
    {
        name: "Smoky",
        troop: "Goliath",
        sex: "male",
        year: 2014,
        chip: 1452,
        img: ["https://i.ibb.co/jWf2zyv/Smoky-Goliath-May-2023-min.jpg"],
        bio: "Arrived as an orphan. Found with someone in a bar.",
        desc: "Long, dark face with light silhouettes underneath, missing tip of tail due to injury, golden caot",
    },
    {
        name: "Tarzan",
        troop: "Goliath",
        sex: "male",
        year: 2013,
        chip: 1124,
        img: ["https://i.ibb.co/BZLJX16/Tarzan-Goliath-Sept-2023-min.jpg"],
        bio: "Arrived as an orphan. Mother was hit and killed by a car. Fostered by Mum.",
        desc: "One of the smaller adult males, light-grey coat, small scar/dent of left side of upper lip, broad mouth",
    },
    {
        name: "Tumbles",
        troop: "Goliath",
        sex: "female",
        year: 2013,
        chip: 31075,
        img: ["https://i.ibb.co/GdhG9WQ/Tumbles-Goliath-Apr-2023-2-min.jpg"],
        bio: "Arrived as an orphan. Was found alone and injured in Zimbabwe.",
        desc: "Triangular and pointy ears, thin silhouettes around eyes, slender, golden coat, will eyebrow is stared at.",
    },
    {
        name: "Vader",
        troop: "Goliath",
        sex: "male",
        year: 2018,
        chip: 26568,
        img: ["https://i.ibb.co/LCjLQ4J/Vader-Goliath-Apr-2023-min.jpg"],
        bio: "Born in troop to former alpha-female Hartley who passed away when he was 9 months old, was then fostered by Dad.",
        desc: "Tall slender sub-adult, dark face with wavy brow",
    },
    {
        name: "Vincent ",
        troop: "Goliath",
        sex: "male",
        year: 2009,
        chip: 1431,
        img: ["https://i.ibb.co/pfZPXqN/Vincent-Goliath-May-2023-min.jpg"],
        bio: "Born in troop to Mrs Gold. High-ranked.",
        desc: "Wavy brow, triangular cut  on bottom of left ear.",
    },
    {
        name: "Waffles",
        troop: "Goliath",
        sex: "female",
        year: 2014,
        chip: 1273,
        img: ["https://i.ibb.co/j3BBL1T/Waffles-Goliath-Feb-2023-2-min.jpg"],
        bio: "Arrived as an orphan.",
        desc: "Quite a large adult, long nose, small tear on top of right ear, golden coat, kink near end of tail",
    },
    {
        name: "Yma",
        troop: "Goliath",
        sex: "female",
        year: 2010,
        chip: 1264,
        img: ["https://i.ibb.co/pj6w9Tz/yma-goliath-feb2023-min.jpg"],
        bio: "Born in troop to Sophia (now deceased). Fostered Amy and Edson once they joined the troop. High-ranked.",
        desc: "Flat ccrooked nose,fluffy head, tear on bottom of ht ear, kinks on tail",
    },
];

export default monkeysArr;
