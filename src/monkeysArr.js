const monkeysArr = [
    {
        name: "Yoda",
        troop: "Koko",
        sex: "male",
        year: 2023,
        img: "https://i.ibb.co/s1zM2FL/yoda-koko-feb2024-2.jpg",
    },
    {
        name: "Timmy",
        troop: "Gismo",
        sex: "male",
        year: 2023,
        img: "https://i.ibb.co/k3q8XXr/timmy-gismo-mar2024.jpg",
    },
    {
        name: "Riccardo",
        troop: "Koko",
        sex: "male",
        year: 2023,
        img: "https://i.ibb.co/hX8Zs3c/riccardo-koko-mar2024.jpg",
    },
    {
        name: "Atlas",
        troop: "Koko",
        sex: "male",
        year: 2023,
        img: "https://i.ibb.co/xD4brFX/atlas-koko-feb2024.jpg",
    },
    {
        name: "TK",
        troop: "Skunkey",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/jJCSQdx/tk-skunkey-mar2024.jpg",
    },
    {
        name: "Samber",
        troop: "Koko",
        sex: "male",
        year: 2023,
        img: "https://i.ibb.co/Xy8Pn6y/samber-koko-mar2024.jpg",
    },
    {
        name: "Paulie",
        troop: "H&B",
        sex: "male",
        year: 2023,
        img: "https://i.ibb.co/d26Jdcb/paulie-hb-mar2024-2.jpg",
    },
    {
        name: "Nugget",
        troop: "Goliath",
        sex: "male",
        year: 2023,
        img: "https://i.ibb.co/vzbDSLK/nugget-goliath-mar2024-2.jpg",
    },
    {
        name: "Wiz",
        troop: "Goliath",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/m0tjhzm/wiz-goliath-apr2024.jpg",
    },
    {
        name: "Kathleen",
        troop: "H&B",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/XZXhgdQ/kathleen-hb-mar2024-2.jpg",
    },
    {
        name: "June",
        troop: "Global",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/7jcS8Fp/june-global-mar2024-2.jpg",
    },
    {
        name: "Harold",
        troop: "D&D",
        sex: "male",
        year: 2023,
        img: "https://i.ibb.co/PrqtB6n/harold-dd-apr2024.jpg",
    },
    {
        name: "Fritzi",
        troop: "Engeltjie",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/hyRQNQ2/fritzi-engeltjie-mar204-2.jpg",
    },
    {
        name: "Elora",
        troop: "Skunkey",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/C130wG9/elora-skunkey-mar2024-2.jpg",
    },
    {
        name: "Darby",
        troop: "James",
        sex: "male",
        year: 2023,
        img: "https://i.ibb.co/JCCYGjL/darby-james-feb2024-2.jpg",
    },
    {
        name: "Anita",
        troop: "Skunkey",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/JFD3PyW/anita-skunkey-mar2024-2.jpg",
    },
    {
        name: "Rowan",
        troop: "Goliath",
        sex: "male",
        year: 2023,
        img: "https://i.ibb.co/Sn78j7j/rowan-goliath-mar2024.jpg",
    },
    {
        name: "Tufty",
        troop: "H&B",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/8s9GpbG/tufyt-hb-feb2024.jpg",
    },
    {
        name: "Wanda",
        troop: "H&B",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/hKkLRhs/wanda-hb-mar2024.jpg",
    },
    {
        name: "Bluebell",
        troop: "H&B",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/dQn22jN/bluebell-hb-mar2024.jpg",
    },
    {
        name: "Mikey",
        troop: "H&B",
        sex: "male",
        year: 2023,
        img: "https://i.ibb.co/rQ9mJN7/mikey-hb-feb2024.jpg",
    },
    {
        name: "Mia",
        troop: "D&D",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/ZBw3DfT/mia-dd-mar2024.jpg",
    },
    {
        name: "Ildiko",
        troop: "D&D",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/jw7bC76/ildiko-dd-apr2024.jpg",
    },
    {
        name: "Remy",
        troop: "Engeltjie",
        sex: "male",
        year: 2023,
        img: "https://i.ibb.co/Q90b47c/remy-engeltjie-may2024.jpg",
    },
    {
        name: "Duimpie",
        troop: "Engeltjie",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/chtSfPC/duimpie-engeltjie-apr2024-temp.jpg",
    },
    {
        name: "Lyyti",
        troop: "Global",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/J35734k/lyyti-global-feb2024.jpg",
    },
    {
        name: "Bugaloo",
        troop: "Bandits",
        sex: "male",
        year: 2023,
        img: "https://i.ibb.co/RzMJ63S/bugaloo-bandits-mar2024.jpg",
    },
    {
        name: "Trixi",
        troop: "SSAV",
        sex: "female",
        year: 2023,
        img: "https://i.ibb.co/t4B6Brv/trixi-saav-apr2024.jpg",
    },
    {
        name: "Harris",
        troop: "SAAV",
        sex: "male",
        year: 2023,
        img: "https://i.ibb.co/rtKmkfc/harris-saav-apr2024.jpg",
    },
];

export default monkeysArr;