'use strict';
require('dotenv').config({ override: true }); // override any stale system env vars with .env values
process.on('uncaughtException',e=>{console.error('[UNCAUGHT]',e.message,e.stack);});
process.on('unhandledRejection',(r)=>{console.error('[UNHANDLED REJECTION]',r);});
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const cr    = require('crypto');
const WS    = require('ws');
const sharp = require('sharp');

// ── Config ────────────────────────────────────────────────────────────────
const PORT      = process.env.PORT || 3000;
// Use /app/data on Render (mounted disk), otherwise local ./data
const DATA_DIR  = process.env.RENDER ? '/app/data' : path.join(__dirname, 'data');
const CHAR_DIR  = path.join(DATA_DIR, 'characters');
const GUILD_FILE= path.join(DATA_DIR, 'guilds.json');
[DATA_DIR, CHAR_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, {recursive:true}); });

function rnd(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function hash(s){ return cr.createHash('sha256').update(s+'smere_salt_v3').digest('hex'); }

// ── Races ─────────────────────────────────────────────────────────────────
const RACES = {
  human:     {name:'Human',     bonus:'Adaptable',      hp:0,  atk:0, def:0, agi:0,  gold:10},
  elf:       {name:'Elf',       bonus:'Arcane Sight',   hp:-2, atk:1, def:0, agi:3,  gold:0 },
  dwarf:     {name:'Dwarf',     bonus:'Stone Skin',     hp:5,  atk:0, def:2, agi:-2, gold:5 },
  halfling:  {name:'Halfling',  bonus:'Lucky',          hp:-2, atk:0, def:1, agi:2,  gold:15},
  orc:       {name:'Orc',       bonus:'Brutish',        hp:8,  atk:2, def:-1,agi:-1, gold:0 },
  tiefling:  {name:'Tiefling',  bonus:'Hellfire',       hp:0,  atk:1, def:0, agi:1,  gold:0 },
  dragonborn:{name:'Dragonborn',bonus:"Dragon's Breath",hp:3,  atk:2, def:0, agi:0,  gold:0 },
  gnome:     {name:'Gnome',     bonus:'Tinker',         hp:-3, atk:0, def:0, agi:2,  gold:20},
  undead:    {name:'Undead',    bonus:'Deathless',      hp:10, atk:0, def:-2,agi:-1, gold:0 },
  beastkin:  {name:'Beastkin',  bonus:'Primal',         hp:4,  atk:1, def:0, agi:2,  gold:0 },
  celestial: {name:'Celestial', bonus:'Holy Aura',      hp:2,  atk:0, def:1, agi:1,  gold:5 },
  goblin:    {name:'Goblin',    bonus:'Sneaky',         hp:-4, atk:2, def:0, agi:3,  gold:25},
  vampire:   {name:'Vampire',   bonus:'Blood Drain',    hp:5,  atk:2, def:-1,agi:2,  gold:0 },
  merfolk:   {name:'Merfolk',   bonus:'Tidal Force',    hp:2,  atk:1, def:1, agi:1,  gold:0 },
  fae:       {name:'Fae',       bonus:'Glamour',        hp:-2, atk:0, def:0, agi:3,  gold:30}
};

// ── Classes ───────────────────────────────────────────────────────────────
const CLASSES = {
  warrior:    {name:'Warrior',    role:'Tank',      hp:35,atk:6,def:4, agi:6,  gold:15,start:['Iron Sword','Leather Armor'],        skills:['power_strike','shield_wall','battle_cry','second_wind','whirlwind']},
  rogue:      {name:'Rogue',      role:'Stealth',   hp:22,atk:9,def:1, agi:14, gold:25,start:['Envenomed Dagger','crude map'],      skills:['backstab','smoke_bomb','poison_blade','pickpocket','shadowstep']},
  mage:       {name:'Mage',       role:'Arcane',    hp:18,atk:5,def:1, agi:10, gold:20,start:['ancient tome','Healing Potion'],     skills:['fireball','frost_bolt','arcane_shield','mana_drain','meteor']},
  ranger:     {name:'Ranger',     role:'Hunter',    hp:26,atk:7,def:2, agi:12, gold:20,start:["ranger's bow",'forest cloak','swamp herb'],skills:['aimed_shot','volley','track','nature_heal','eagle_eye']},
  paladin:    {name:'Paladin',    role:'Holy',      hp:30,atk:5,def:4, agi:7,  gold:20,start:['Iron Sword','Iron Shield','Healing Potion'],skills:['holy_strike','lay_on_hands','divine_shield','smite','consecrate']},
  beastmaster:{name:'Beastmaster',role:'Tamer',     hp:28,atk:6,def:2, agi:9,  gold:20,start:["ranger's bow",'beast treat','beast treat'],skills:['beast_roar','pack_attack','wild_instinct','alpha_call','tame_skill']},
  zombie_mage:{name:'Zombie Mage',role:'Necromancy',hp:20,atk:5,def:2, agi:7,  gold:15,start:['ancient tome','bone shard'],        skills:['raise_dead','corpse_bomb','necrotic_bolt','death_shield','plague']},
  necromancer:{name:'Necromancer',role:'Necromancy',hp:19,atk:5,def:1, agi:8,  gold:15,start:['ancient tome','grave dust'],        skills:['raise_dead','soul_drain','bone_wall','curse_skill','lich_form']},
  berserker:  {name:'Berserker',  role:'Rage',      hp:32,atk:8,def:-1,agi:10, gold:10,start:['Battle Axe'],                       skills:['rage','blood_lust','reckless_strike','war_cry','frenzy']},
  druid:      {name:'Druid',      role:'Nature',    hp:25,atk:4,def:2, agi:9,  gold:20,start:['forest cloak','swamp herb','swamp herb'],skills:['entangle','shapeshift','regrowth','summon_wolves','barkskin']},
  monk:       {name:'Monk',       role:'Martial',   hp:28,atk:7,def:3, agi:13, gold:10,start:['Healing Potion'],                   skills:['ki_strike','iron_fist','deflect','meditation','thousand_cuts']},
  shadowblade:{name:'Shadowblade',role:'Hybrid',    hp:24,atk:8,def:2, agi:12, gold:20,start:['Envenomed Dagger','forest cloak'],  skills:['shadow_strike','blink','curse_blade','fade','death_mark']},
  shaman:     {name:'Shaman',     role:'Spirit',    hp:24,atk:5,def:2, agi:8,  gold:20,start:['ancient rune','swamp herb'],        skills:['spirit_bolt','ancestral_shield','hex','chain_lightning','totem']},
  alchemist:  {name:'Alchemist',  role:'Support',   hp:22,atk:4,def:2, agi:9,  gold:30,start:['Healing Potion','Healing Potion','Antidote'],skills:['acid_splash','transmute','brew','explosive_flask','catalyst']},
  warlock:    {name:'Warlock',    role:'Darkness',  hp:22,atk:6,def:1, agi:8,  gold:15,start:['void crystal','cultist robe'],      skills:['eldritch_blast','dark_pact','banish','soul_siphon','doom']},
  templar:    {name:'Templar',    role:'Order',     hp:30,atk:5,def:5, agi:6,  gold:15,start:['Iron Sword','Plate Armor'],         skills:['judgement','holy_nova','fortress','inspire','purge']},
  spellblade: {name:'Spellblade', role:'Hybrid',    hp:24,atk:7,def:2, agi:10, gold:20,start:['Iron Sword','ancient tome'],        skills:['runic_strike','mana_shield','spell_surge','counter_skill','arcane_blade']},
  trickster:  {name:'Trickster',  role:'Chaos',     hp:21,atk:6,def:1, agi:13, gold:35,start:['crude map','Envenomed Dagger'],     skills:['confuse','mirror_image','jinx','larceny','wild_magic']},
  deathknight:{name:'Death Knight',role:'Dark Tank',hp:33,atk:7,def:3, agi:7,  gold:10,start:['Battle Axe','Chain Mail'],          skills:['death_strike','dark_aura','unholy_ground','bone_shield','soul_rend']},
  channeler:  {name:'Channeler',  role:'Summoner',  hp:20,atk:4,def:1, agi:9,  gold:20,start:['ancient tome','void crystal'],      skills:['channel_fire','channel_ice','rift','overload','elemental_form']}
};

// ── Skill metadata (name + cooldown) ─────────────────────────────────────
const SK = {
  power_strike:{n:'Power Strike',cd:3,cmb:true},   shield_wall:{n:'Shield Wall',cd:4,cmb:true},
  battle_cry:{n:'Battle Cry',cd:5,cmb:true},        second_wind:{n:'Second Wind',cd:6,cmb:true},
  whirlwind:{n:'Whirlwind',cd:5,cmb:true},           backstab:{n:'Backstab',cd:3,cmb:true},
  smoke_bomb:{n:'Smoke Bomb',cd:4,cmb:true},         poison_blade:{n:'Poison Blade',cd:5,cmb:true},
  pickpocket:{n:'Pickpocket',cd:0,cmb:false},        shadowstep:{n:'Shadowstep',cd:4,cmb:true},
  fireball:{n:'Fireball',cd:3,cmb:true},             frost_bolt:{n:'Frost Bolt',cd:3,cmb:true},
  arcane_shield:{n:'Arcane Shield',cd:5,cmb:true},   mana_drain:{n:'Mana Drain',cd:4,cmb:true},
  meteor:{n:'Meteor',cd:7,cmb:true},                 aimed_shot:{n:'Aimed Shot',cd:3,cmb:true},
  volley:{n:'Volley',cd:5,cmb:true},                 track:{n:'Track',cd:0,cmb:false},
  nature_heal:{n:'Nature Heal',cd:4,cmb:true},       eagle_eye:{n:'Eagle Eye',cd:4,cmb:true},
  holy_strike:{n:'Holy Strike',cd:3,cmb:true},       lay_on_hands:{n:'Lay on Hands',cd:4,cmb:true},
  divine_shield:{n:'Divine Shield',cd:6,cmb:true},   smite:{n:'Smite',cd:5,cmb:true},
  consecrate:{n:'Consecrate',cd:5,cmb:true},         tame_skill:{n:'Tame',cd:0,cmb:false},
  beast_roar:{n:'Beast Roar',cd:4,cmb:true},         pack_attack:{n:'Pack Attack',cd:4,cmb:true},
  wild_instinct:{n:'Wild Instinct',cd:5,cmb:true},   alpha_call:{n:'Alpha Call',cd:6,cmb:true},
  raise_dead:{n:'Raise Dead',cd:5,cmb:false},        corpse_bomb:{n:'Corpse Bomb',cd:4,cmb:true},
  necrotic_bolt:{n:'Necrotic Bolt',cd:3,cmb:true},   death_shield:{n:'Death Shield',cd:5,cmb:true},
  plague:{n:'Plague',cd:6,cmb:true},                 soul_drain:{n:'Soul Drain',cd:3,cmb:true},
  bone_wall:{n:'Bone Wall',cd:5,cmb:true},           curse_skill:{n:'Curse',cd:4,cmb:true},
  lich_form:{n:'Lich Form',cd:8,cmb:true},           rage:{n:'Rage',cd:4,cmb:true},
  blood_lust:{n:'Blood Lust',cd:5,cmb:true},         reckless_strike:{n:'Reckless Strike',cd:3,cmb:true},
  war_cry:{n:'War Cry',cd:5,cmb:true},               frenzy:{n:'Frenzy',cd:6,cmb:true},
  entangle:{n:'Entangle',cd:4,cmb:true},             shapeshift:{n:'Shapeshift',cd:6,cmb:true},
  regrowth:{n:'Regrowth',cd:4,cmb:true},             summon_wolves:{n:'Summon Wolves',cd:6,cmb:true},
  barkskin:{n:'Barkskin',cd:5,cmb:true},             ki_strike:{n:'Ki Strike',cd:3,cmb:true},
  iron_fist:{n:'Iron Fist',cd:4,cmb:true},           deflect:{n:'Deflect',cd:4,cmb:true},
  meditation:{n:'Meditation',cd:5,cmb:true},         thousand_cuts:{n:'Thousand Cuts',cd:6,cmb:true},
  shadow_strike:{n:'Shadow Strike',cd:3,cmb:true},   blink:{n:'Blink',cd:4,cmb:true},
  curse_blade:{n:'Curse Blade',cd:4,cmb:true},       fade:{n:'Fade',cd:5,cmb:true},
  death_mark:{n:'Death Mark',cd:6,cmb:true},         spirit_bolt:{n:'Spirit Bolt',cd:3,cmb:true},
  ancestral_shield:{n:'Ancestral Shield',cd:4,cmb:true},hex:{n:'Hex',cd:4,cmb:true},
  chain_lightning:{n:'Chain Lightning',cd:5,cmb:true},totem:{n:'Totem',cd:6,cmb:true},
  acid_splash:{n:'Acid Splash',cd:3,cmb:true},       transmute:{n:'Transmute',cd:5,cmb:false},
  brew:{n:'Brew',cd:0,cmb:false},                    explosive_flask:{n:'Explosive Flask',cd:4,cmb:true},
  catalyst:{n:'Catalyst',cd:5,cmb:true},             eldritch_blast:{n:'Eldritch Blast',cd:3,cmb:true},
  dark_pact:{n:'Dark Pact',cd:5,cmb:true},           banish:{n:'Banish',cd:5,cmb:true},
  soul_siphon:{n:'Soul Siphon',cd:4,cmb:true},       doom:{n:'Doom',cd:7,cmb:true},
  judgement:{n:'Judgement',cd:3,cmb:true},           holy_nova:{n:'Holy Nova',cd:5,cmb:true},
  fortress:{n:'Fortress',cd:5,cmb:true},             inspire:{n:'Inspire',cd:4,cmb:true},
  purge:{n:'Purge',cd:4,cmb:true},                   runic_strike:{n:'Runic Strike',cd:3,cmb:true},
  mana_shield:{n:'Mana Shield',cd:4,cmb:true},       spell_surge:{n:'Spell Surge',cd:5,cmb:true},
  counter_skill:{n:'Counter',cd:4,cmb:true},         arcane_blade:{n:'Arcane Blade',cd:6,cmb:true},
  confuse:{n:'Confuse',cd:3,cmb:true},               mirror_image:{n:'Mirror Image',cd:5,cmb:true},
  jinx:{n:'Jinx',cd:4,cmb:true},                     larceny:{n:'Larceny',cd:4,cmb:true},
  wild_magic:{n:'Wild Magic',cd:3,cmb:true},         death_strike:{n:'Death Strike',cd:3,cmb:true},
  dark_aura:{n:'Dark Aura',cd:5,cmb:true},           unholy_ground:{n:'Unholy Ground',cd:5,cmb:true},
  bone_shield:{n:'Bone Shield',cd:4,cmb:true},       soul_rend:{n:'Soul Rend',cd:6,cmb:true},
  channel_fire:{n:'Channel Fire',cd:3,cmb:true},     channel_ice:{n:'Channel Ice',cd:3,cmb:true},
  rift:{n:'Rift',cd:6,cmb:true},                     overload:{n:'Overload',cd:5,cmb:true},
  elemental_form:{n:'Elemental Form',cd:7,cmb:true}
};

// ── Monster portraits (served from /monsters/ static folder) ─────────────
const MOB_PORTRAITS = {
  // Frozen Tundra
  'Frost Queen':        'frost_queen.jpg',
  'Frost Knight':       'frost_knight.jpg',
  'Ice Shard Golem':    'ice_golem.jpg',
  'Yeti':               'yeti.jpg',
  'Ice Wraith':         'ice_wraith.jpg',
  'Frost Wolf':         'frost_wolf.jpg',
  // Volcanic Peak
  'Flame Titan':        'flame_titan.jpg',
  'Rock Wyrm':          'rock_wyrm.jpg',
  'Fire Imp':           'fire_imp.jpg',
  'Lava Golem':         'lava_golem.jpg',
  'Fire Elemental':     'fire_elem.jpg',
  // Dungeon Lower
  'Dungeon Lich':       'dungeon_lich.jpg',
  "Lich's Champion":    'lichs_champion.jpg',
  'Void Archon':        'void_archon.jpg',
  'Void Cultist':       'void_cultist.jpg',
  'Young Dragon':       'young_dragon.jpg',
  'Shadow Wraith':      'shadow_wraith.jpg',
  // Void Sanctum
  'Void God':           'void_god.jpg',
  'Void Scholar':       'void_scholar.jpg',
  'Null Horror':        'null_horror.jpg',
  'Void Wraith':        'void_wraith.jpg',
  // Astral Sea
  'Astral Leviathan':   'astral_leviathan.jpg',
  'Githyanki Pirate':   'githyanki.jpg',
  'Plane Walker':       'plane_walker.jpg',
  'Astral Shark':       'astral_shark.jpg',
  // Crystal Caverns
  'Crystal Golem':      'crystal_golem.jpg',
  'Gem Spider':         'gem_spider.jpg',
  'Diamond Guardian':   'diamond_guardian.jpg',
  'Prism Titan':        'prism_titan.jpg',
  // Shadow Realm
  'Void Emperor':       'void_emperor.jpg',
  'Dark Treant':        'dark_treant.jpg',
  'Banshee':            'banshee.jpg',
  'Nightmare Hound':    'nightmare_hound.jpg',
  'Shadow Demon':       'shadow_demon.jpg',
  // Sky Realm
  'Storm God':          'storm_god.jpg',
  'Stone Sentinel':     'stone_sentinel.jpg',
  'Thunder Hawk':       'thunder_hawk.jpg',
  'Wind Spirit':        'wind_spirit.jpg',
  // Haunted Keep
  'Death Baron':        'death_baron.jpg',
  'Bone Horror':        'bone_horror.jpg',
  'Chained Revenant':   'chained_revenant.jpg',
  'Cursed Knight':      'cursed_knight.jpg',
  'Wailing Specter':    'wailing_specter.jpg',
  // Ashford Bandits
  'Bandit King':        'bandit_king.jpg',
  'Bandit Thug':        'bandit_thug.jpg',
  'Bandit Scout':       'bandit_scout.jpg',
  // Night creatures
  'Night Horror':       'night_horror.jpg',
  'Shadow Stalker':     'shadow_stalker.jpg',
  // Forest
  'Bog Witch':          'bog_witch.jpg',
  'Swamp Serpent':      'swamp_serpent.jpg',
  'Stone Golem':        'stone_golem.jpg',
  'Forest Troll':       'forest_troll.jpg',
  'Timber Wolf':        'timber_wolf.jpg',
  'Giant Rat':          'giant_rat.jpg',
  // Dungeon Upper
  'Corrupt Priest':     'corrupt_priest.jpg',
  'Prison Guard Ghost': 'prison_guard_ghost.jpg',
  'Crypt Lich':         'crypt_lich.jpg',
  'Risen Cultist':      'risen_cultist.jpg',
  'Risen Corpse':       'risen_corpse.jpg',
  'Armored Skeleton':   'armor_skel.jpg',
  'Skeleton Warrior':   'skel_warrior.jpg',
  // ── King's Road Trail ─────────────────────────────────────────────────────
  'Trail Wolf':           'trail_wolf.jpg',
  'Trail Bandit':         'trail_bandit.jpg',
  'Cave Bat':             'cave_bat.jpg',
  'Large Spider':         'large_spider.jpg',
  'Highland Wolf':        'highland_wolf.jpg',
  'Stone Crow':           'stone_crow.jpg',
  'Deserter Soldier':     'deserter_soldier.jpg',
  'Pack Rat':             'pack_rat.jpg',
  'Giant Boar':           'giant_boar.jpg',
  'Forest Bandit':        'forest_bandit.jpg',
  'Plague Ghoul':         'plague_ghoul.jpg',
  'River Troll':          'river_troll.jpg',
  'Water Serpent':        'water_serpent.jpg',
  'Vine Golem':           'vine_golem.jpg',
  'Assassin Vine':        'assassin_vine.jpg',
  'Gargoyle Sentinel':    'gargoyle_sentinel.jpg',
  'Tower Wraith':         'tower_wraith.jpg',
  'Scarecrow Horror':     'scarecrow_horror.jpg',
  'Grain Toad':           'grain_toad.jpg',
  // Bogwood Trail
  'Bog Frog':             'bog_frog.jpg',
  'Mud Lurker':           'mud_lurker.jpg',
  'Swamp Cultist':        'swamp_cultist.jpg',
  'Shrine Guardian':      'shrine_guardian.jpg',
  'Bog Horror':           'bog_horror.jpg',
  // The Ravine
  'Cave Spider':          'cave_spider.jpg',
  'Rock Crawler':         'rock_crawler.jpg',
  'Ravine Serpent':       'ravine_serpent.jpg',
  'Crystal Beetle':       'crystal_beetle.jpg',
  'Stone Leviathan':      'stone_leviathan.jpg',
  // Hill Barrows
  'Barrow Wight':         'barrow_wight.jpg',
  'Grave Robber':         'grave_robber.jpg',
  'Tomb Guardian':        'tomb_guardian.jpg',
  'Barrow Skeleton':      'barrow_skeleton.jpg',
  'Barrow King':          'barrow_king.jpg',
  // Bandit Hideout
  'Bandit Cutthroat':     'bandit_cutthroat.jpg',
  'Bandit Sharpshooter':  'bandit_sharpshooter.jpg',
  'Bandit Enforcer':      'bandit_enforcer.jpg',
  'Bandit Guard':         'bandit_vault_guard.jpg',
  'Road Captain':         'road_captain.jpg',
  // Farmstead Ruins
  'Farmstead Shade':      'farmstead_shade.jpg',
  'Grave Pest':           'grave_pest.jpg',
  'Animated Plough':      'animated_plough.jpg',
  'Silo Rat':             'silo_rat.jpg',        // fixed typo: was silo_rate.jpg
  'Cave Toad':            'cave_toad.jpg',
  'Farmstead Wraith':     'farmstead_wraith.jpg',
  'Swamp Cultist':        'swamp_cultist.jpg',
  'Water Serpent':        'water_serpent.jpg',
  // ── Ashford Elite Zones ──────────────────────────────────────────────────
  'Rust Stalker':         'shadow_stalker.jpg',
  'Iron Golem':           'stone_golem.jpg',
  'War Automaton':        'stone_sentinel.jpg',  // construct/guardian — better fit than githyanki
  'Corroded Titan':       'stone_leviathan.jpg',
  'Rusted Colossus':      'stone_leviathan.jpg',
  'Drowned Knight':       'cursed_knight.jpg',
  'Sea Lich':             'crypt_lich.jpg',
  'Necromancer Priest':   'corrupt_priest.jpg',
  'Bone Leviathan':       'astral_leviathan.jpg',
  'Lich Sovereign':       'dungeon_lich.jpg',
  'Lava Knight':          'flame_titan.jpg',     // fire-themed — was frost_knight (wrong element)
  'Fire Drake':           'young_dragon.jpg',
  'Ancient Magma Wyrm':   'rock_wyrm.jpg',
  'Rift Walker':          'plane_walker.jpg',
  'Plane Construct':      'stone_sentinel.jpg',  // construct/sentinel theme
  'Reality Shade':        'shadow_wraith.jpg',
  'Void Abomination':     'void_archon.jpg',
  'Plane Breaker':        'void_archon.jpg',
  'Corrupted Angel':      'void_emperor.jpg',
  'Dread Seraph':         'void_emperor.jpg',
  'Fallen Guardian':      'death_baron.jpg',
  'Abyssal Archon':       'void_archon.jpg',
  'Dread Archon':         'void_emperor.jpg',
  'Nameless Herald':      'void_wraith.jpg',
  'Void Incarnate':       'void_god.jpg',
  'Eternal Horror':       'null_horror.jpg',
  'The Forgotten':        'void_wraith.jpg',
  'The Nameless God':     'void_god.jpg',
  // ── Ironveil Mines ───────────────────────────────────────────────────────
  'Road Bandit':          'trail_bandit.jpg',
  'Rock Snake':           'swamp_serpent.jpg',
  'Stone Gnome':          'grave_pest.jpg',      // small underground creature
  'Iron Golem Shard':     'iron_golem_shard.jpg',
  'Mine Wraith':          'mine-wraith.jpg',
  // ── Frostheim Trail ──────────────────────────────────────────────────────
  'Ice Wolf':             'frost_wolf.jpg',
  'Mountain Bandit':      'trail_bandit.jpg',
  'Frost Troll':          'forest_troll.jpg',
  'Snow Wraith':          'shadow_wraith.jpg',
  'Ice Golem':            'ice_golem.jpg',       // was stone_golem — now uses correct ice variant
  'Frost Giant':          'yeti.jpg',            // large arctic creature — better than sea leviathan
};



// ── Companion portrait map ────────────────────────────────────────────────────
const COMPANION_PORTRAITS = {
  'Black Cat':     'black_cat',
  'War Hound':     'war_hound',
  'Raven':         'raven',
  'Cave Bear':     'cave_bear',
  'Shadow Fox':    'shadow_fox',
  'Frost Hawk':    'frost_hawk',
  'Iron Tortoise': 'iron_tortoise',
  'Imp':           'imp',
  'Giant Rat':     'giant_rat',
  'Timber Wolf':   'timber_wolf',
  'Swamp Serpent': 'swamp_serpent',
  'Forest Troll':  'forest_troll',
  'Bog Witch':     'bog_witch',
  'Young Dragon':  'young_dragon',
};

// ── Image resolver — tries .jpg then .jpeg then .png ────────────────────────
function resolveImg(folder, base){
  const b = base.replace(/\.(jpg|jpeg|png)$/i,'');
  // Strip common prefixes so filenames match GitHub upload convention (e.g. room_forest_ruins -> forest_ruins)
  const stripped = b.replace(/^room_/,'');
  const candidates = b === stripped ? [b] : [b, stripped];
  const locations = [
    path.join(__dirname,'public',folder),
    path.join(__dirname,'public'),
  ];
  for(const cand of candidates){
    for(const loc of locations){
      for(const ext of ['jpg','jpeg','png','JPG','JPEG','PNG']){
        try{
          const fp = path.join(loc, cand+'.'+ext);
          if(fs.existsSync(fp)){
            const urlBase = loc.endsWith('public') ? '' : '/'+folder;
            return urlBase+'/'+cand+'.'+ext.toLowerCase();
          }
        }catch(e){}
      }
    }
  }
  // Fallback: preserve original extension so .png files don't get .jpg URL
  const origExt = base.match(/\.(jpg|jpeg|png)$/i)?.[1]?.toLowerCase() || 'jpg';
  return '/'+folder+'/'+stripped+'.'+origExt;
}

// ── Item image helper ─────────────────────────────────────────────────────
function itemImg(rawName) {
  // Strip count prefix like "(3) " added by sidebar inventory dedup
  const name = rawName.replace(/^\(\d+\)\s*/,'').toLowerCase();
  const prof = ITEM_PROFILES[name];
  if (prof && prof.img) return resolveImg('items', prof.img);
  // Also check ITEM_LORE (legendary items defined there only)
  const lore = typeof ITEM_LORE !== 'undefined' && ITEM_LORE[name];
  if (lore && lore.img) return resolveImg('items', lore.img);
  // Fallback: slugify — remove apostrophes first so "lich's" → "lichs" not "lich_s"
  const slug = name.replace(/'/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  return resolveImg('items', slug);
}

// ── Room profiles — detailed descriptions + image slots ───────────────────
const ROOM_PROFILES = {

  // ── Town of Shadowmere ───────────────────────────────────────────────────
  "town_square": {
    img: "room_town_square",
    detail: `The cobblestones of Town Square have been worn smooth by a thousand years of boots. Seven streets converge here in a rough circle around the Adventure Shrine — a ring of standing stones that crackles with cold blue light even in the middle of the day.

The Shrine draws the eye first. Then the Notice Board, plastered with bounties and announcements in varying states of weathering. Then the buildings — the Temple spire to the west, the warm lantern glow of the Broken Flagon to the east, Market Street climbing away to the north.

A single old coin glints between two cobblestones near the Shrine. Someone must drop one every time they leave.`,
    atmosphere: "The air smells of woodsmoke, rain on stone, and something faintly electric from the Shrine."
  },

  "market_street": {
    img: "room_market_street",
    detail: `Market Street runs north from Town Square between two rows of buildings that lean toward each other as if sharing a secret. The cobbles here are newer — the old ones were pulled up and replaced after the flooding three winters back.

The Weaponsmith's hammer rings out from the north end of the lane. A painted sign swings above the alley entrance to the east — no name on it, just a painted eye, which regulars know means the Shadow Broker. Pip's Menagerie banners hang to the west, perpetually at risk of being torn loose by whatever unusual animal Pip has acquired this week.`,
    atmosphere: "The street smells of iron filings, animal feed, and something unidentifiable from the alley."
  },

  "tavern": {
    img: "the_broken_flagon",
    detail: `The Broken Flagon was named for the ceramic mug mounted above the bar — Tormund's father threw it at a man who deserved it, and Tormund has kept the two pieces ever since. The tavern itself is a low-ceilinged room of dark timber, scarred tables, and a hearth that has not been fully extinguished in thirty years.

Half-full tankards sit on the bar from last night. Tormund does not clear them until he knows whether their owners are coming back. Sometimes they do not.

The smell of old ale, pipe smoke, and roasting meat is thick enough to wear. A wanted board behind the bar lists names Tormund would prefer not to see come through the door.`,
    atmosphere: "Warm, close, slightly too loud. The fire pops."
  },

  "apothecary": {
    img: "room_apothecary",
    detail: `Mira's apothecary is organized by a logic only she fully understands. Bottles cover every surface — clear glass, dark glass, ceramic, wax-sealed, cork-stopped, labelled in a handwriting that grows smaller and more precise the more dangerous the contents.

Dried plants hang from the ceiling in dense clusters. The mortar on the counter is stained nine colors. A small notebook beside it is open to a page of calculations that probably represent weeks of work.

Mira herself rarely explains what she is making. She considers the question an interruption.`,
    atmosphere: "Sharp, herbal, and faintly sulfurous. The kind of smell that stays in your clothes."
  },

  "weaponsmith": {
    img: "room_weaponsmith",
    detail: `Grimwald's forge is the hottest building in Shadowmere and possibly the loudest. The man himself is usually bent over the anvil when you arrive, and he will finish what he is doing before he acknowledges you. This is not rudeness — he simply will not ruin a piece for a conversation.

Finished weapons hang on the walls in varying states of ornamentation. The plain ones are usually better. Grimwald considers decorative metalwork to be the province of people who have never actually used a blade.

The floor is dark with decades of scale and ash. The bellows in the corner is large enough to inflate a small building.`,
    atmosphere: "Overwhelmingly hot. The smell of hot iron, coal smoke, and quenching oil."
  },

  "temple": {
    img: "temple_of_the_fallen",
    detail: `The Temple of the Fallen was grand once. High vaulted ceilings, colored glass in the upper windows, carved stone that told the story of the Fallen gods in panels around the walls. The glass is mostly gone now — some broken, some removed for safety, one window boarded up after a storm fifteen years ago that nobody got around to repairing.

Father Aldric kneels at the altar regardless. He has knelt here for forty years. The altar cloth is immaculate because he launders it himself. The candles are always fresh because he replaces them before they burn down.

He prays to gods who have not answered in a long time. He does not seem to have stopped believing they will.`,
    atmosphere: "Cold, quiet, and faintly incense-scented. Sound carries strangely here."
  },

  "adventure_shrine": {
    img: "room_adventure_shrine",
    detail: `Seven standing stones form a rough circle on the elevated platform above Town Square, each carved from a different stone — granite, basalt, limestone, marble — brought from the zones they correspond to. The runes cut into their faces glow in the blue-white of very old magic.

At the centre, a shallow stone basin holds a flame that burns without fuel and without smoke. The Keeper stands at its edge, eyes closed, lips moving in a constant low murmur — the coordinates of distant places, kept active by repetition.

The platform itself is cold even in summer. The air feels thinner here, as if the Shrine exists slightly outside the world it connects.`,
    atmosphere: "Cold, ozone-sharp. The flame makes no sound. The Keeper's murmur is the only sound."
  },

  "south_gate": {
    img: "room_south_gate",
    detail: `The South Gate is where the town ends and the world begins. Two iron-banded posts mark the boundary — the gates themselves were taken down years ago and never replaced. What passes through here does not need a gate to stop it.

A torch bracket on the right post holds a fresh torch. Someone replaces it every morning. Nobody knows who.

Beyond the posts, the road south becomes a track, and the track becomes a path, and the path loses confidence in itself within fifty meters of the tree line. The forest beyond is old enough that the trees have names — the locals know them, and do not share them with newcomers.

At night, something watches from the tree line. It has not attacked anyone standing at the gate. It is not clear why.`,
    atmosphere: "Wind from the south brings the smell of wet leaves and dark soil."
  },

  "pet_store": {
    img: "room_pet_store",
    detail: `Pip's Exotic Animal Menagerie smells exactly as you would expect a building containing birds, reptiles, and at least one thing that has not been identified yet. Pip himself is 3.5 feet of pure enthusiasm, permanently in motion, and currently explaining something to a snake that does not appear to be listening.

The cages and tanks cover every wall and most of the floor. Labels on the enclosures are written in Pip's hand and range from precise ("Rare Coral Serpent, venomous, do not reach in") to philosophical ("Whatever this is. 23 intelligence. Do not look directly at it.").

Beast Treats are kept behind the counter. Pip makes them himself from a recipe he will not share.`,
    atmosphere: "Warm, humid, and extremely varied in scent."
  },

  "alley": {
    img: "the_alley",
    detail: `The alley between the smithy and the apothecary is narrow enough that two people cannot pass without one of them turning sideways. The painted eye above the entrance is the only sign. Regulars know it. Newcomers figure it out eventually.

The passage bends twice before opening into the small courtyard where the Shadow Broker operates. The bends are not architectural — they are deliberate, so that no one approaching from Market Street can see what is happening at the other end.

The cobbles here are clean in an eerie way. Nothing accumulates. People do not leave things behind in this alley.`,
    atmosphere: "Shadowed even at noon. Cold. Quieter than it should be this close to a busy street."
  },

  "black_market": {
    img: "room_black_market",
    detail: `The courtyard at the end of the alley is small, walled on three sides, and roofed with canvas that keeps the rain off without blocking the exits. The Shadow Broker stands in the same spot every time — hood up, hands clasped, face completely invisible inside the shadow of the cowl.

The goods are not displayed. You describe what you want. The Broker either has it or does not, and tells you the price with the manner of someone who has already decided it is non-negotiable.

A single red lamp hangs from the canvas frame. It does not flicker.`,
    atmosphere: "Still air. The lamp gives red light. No sound from the street."
  },

  "guild_district": {
    img: "room_guild_district",
    detail: `The Guild District occupies the north end of the temple road — a broad lane of buildings that announce their importance through architecture. Heavy doors, carved lintels, brass fittings, windows that are slightly larger than necessary.

The Guild Registry sits at the north end, identifiable by the queue that forms outside it on registration days. Registrar Voss can be seen through the window at his desk, surrounded by towers of ledgers, wearing the expression of a man who has been personally wronged by disorder.

Guild Hall Row extends east — a line of hall entrances, each bearing the name and sigil of its guild above the door.`,
    atmosphere: "Formal. The kind of street that makes you straighten your posture automatically."
  },

  "guild_registry": {
    img: "room_guild_registry",
    detail: `The Guild Registry is a room almost entirely composed of paper. Ledgers line every wall from floor to ceiling. Scroll cases fill a cabinet that takes up the entire east wall. Loose documents cover every surface that a ledger does not.

Registrar Voss sits at the centre of it behind a desk that is technically clear — he considers a cluttered desk a moral failing — working through a stack of applications with methodical precision. He does not look up when you enter. He finishes his sentence first.

The registry records every guild ever formed in Shadowmere, going back two hundred and thirty years. Voss knows the contents of every ledger. He finds this unremarkable.`,
    atmosphere: "The smell of old paper and ink. Perfectly quiet except for the scratch of Voss's pen."
  },

  "guild_hall_row": {
    img: "room_guild_hall_row",
    detail: `A row of hall entrances line the east side of the Guild District — heavy doors, each bearing the carved name and sigil of the guild within. The quality of the carving varies significantly, which tells you something about the age and resources of each guild.

Between the halls, narrow passages lead to the service yards behind them. The district is busier on evenings when guilds hold their meetings — the halls light up and voices carry through the stone.

An empty hall at the end of the row still bears the ghost of a name where the sign was removed. Nobody talks about which guild it was.`,
    atmosphere: "Quiet during the day. The stone here is older than the rest of the district."
  },

  // ── Temple Crypt ─────────────────────────────────────────────────────────
  "temple_crypt": {
    img: "room_temple_crypt",
    detail: `The crypt beneath the Temple of the Fallen was sealed for fifty years. Father Aldric unsealed it himself — he would not say why, and he will not discuss what he found when he did.

The stairs from the temple descend into a vaulted chamber of old limestone. The walls hold burial niches, most of them occupied. The inscriptions above each niche are in a script that predates common language. The crypt scholar who was brought in to translate them left without completing the work and did not explain why.

The air is very cold and very still. The candles Aldric places here burn without guttering. The further south you go, the older the stonework becomes — and the dungeon below is older still.`,
    atmosphere: "Cold, absolutely still air. The silence has texture."
  },

  // ── Ashford Village ──────────────────────────────────────────────────────
  "ashford_inn_yard": {
    img: "outside_the_rusted_nail",
    detail: `A strip of dirt yard along the front of the Rusted Nail — two benches, a heavy oak table worn smooth by years of weather and elbows, and a view of the square that nobody has ever described as attractive but which Oswin considers adequate.

Oswin has been sitting at this table for six years. He arrived in Ashford the season after the capital fell — nobody asks which capital — with a travelling case, a chess board, and the particular composure of someone who has already processed the worst outcome and made peace with it. He plays chess because there is nothing else he is interested in doing, and he plays it at this table because the light is acceptable in the afternoon.

The chess board is always set up. Oswin is always there. The Rusted Nail is one step east, the square one step west. Most of Ashford walks past him twice a day without stopping. A few have learned to stop.`,
    atmosphere: "The creak of the inn sign in the wind. The faint smell of whatever Barret is cooking. Oswin moves a piece without looking up."
  },

  "ashford_inn": {
    img: "room_ashford_inn",
    detail: `Old Barret's inn in Ashford is smaller than the Broken Flagon and older, and has the particular quality of a building that has been repaired so many times it is more repair than original structure. Barret runs it alone since his wife passed, and has done for eight years.

The common room holds six tables. The kitchen is better than the building suggests — Barret was a cook before he was an innkeeper, and the standards of a previous life have not entirely faded.

He does not ask where travelers have been or where they are going. He considers it none of his business. This makes him unusually restful company.`,
    atmosphere: "Warm, worn in. Smells of whatever Barret is cooking."
  },

  "ashford_store": {
    img: "martas_general_store",
    detail: `Marta's general store is the only place in Ashford where you can reliably get anything — supplies, tools, information, and a pointed silence if you ask the wrong question. Marta stocks it herself, prices it herself, and has a precise mental inventory of every item on every shelf.

She keeps her arms crossed most of the time. Not defensively — it is simply her default position when not actively doing something with her hands. She watches customers the way someone watches weather: attentively and without particular warmth.

The store is clean, well-organized, and slightly more expensive than you would expect for a village of this size. Marta considers this fair.`,
    atmosphere: "Neat, functional. The bell above the door is the only decoration."
  },

  "ashford_gate": {
    img: "room_ashford_gate",
    detail: `The gate marking the edge of Ashford Village is less a gate than an idea of one — two posts and a crossbar, the wood grey and cracked, the hinges rusted open decades ago. A weathered signpost has been nailed to the right post and re-nailed twice, each time at a slightly different angle.

The path south leads back through the Deep Ashwood, which the locals do not enter after dark, and which some of them avoid entirely. The path north leads into Ashford proper — a village that has survived things that should have ended it, and carries the weight of that survival in everything from its architecture to its expressions.`,
    atmosphere: "The smell of woodsmoke from cook fires. Dogs bark somewhere in the village."
  },

  "ashford_square": {
    img: "room_ashford_square",
    detail: `Ashford Square is a rectangle of packed earth around a stone well that has been in continuous use for two hundred years. The stone around the well-mouth is worn into a groove by rope. The bucket is new — someone replaced it last season.

The villagers who cross the square do so with purpose. They do not linger, and they assess strangers with the efficient thoroughness of people who have had reasons to be careful about who arrives in their village. They are not hostile. They are thorough.

The buildings around the square are low and practical — stone bases, timber upper floors, thatched roofs replaced on a rolling schedule. Nothing decorative. Everything functional.`,
    atmosphere: "Wind comes through from the south, carrying the smell of the forest. The well rope creaks."
  },

  "ashford_healer": {
    img: "brother_finns_healer",
    detail: `Brother Finn arrived in Ashford three years ago, planning to stay a few weeks. The few weeks became a season when he found the village had no healer. The season became permanent when the healer he sent for from the city never arrived.

His healing room is a converted storage space behind the village hall. Herbs hang drying from the ceiling — some familiar, some not, all sourced from the surrounding forest which Finn has mapped extensively in a notebook he keeps tucked in his belt. His notes are meticulous.

He looks tired. He usually looks tired. There is always someone who needs something.`,
    atmosphere: "Herbal, clean. Quieter than the street outside."
  },

  // ── Ashwood Forest ────────────────────────────────────────────────────────
  "ashwood_edge": {
    img: "room_ashwood_edge",
    detail: `The edge of Ashwood is where the town ends with confidence and the forest begins with reluctance. The ash-barked trees here are pale enough to look silver in fog — which is most mornings. The canopy is thin enough that grey light reaches the ground, giving everything a washed-out quality that makes distances hard to judge.

Wolves howl from somewhere that echoes. In the fog, howling seems to come from multiple directions simultaneously. The locals have stopped trying to count wolves from sound — there are always more than you expect.

The path south descends into denser forest. The path north returns to the South Gate, which is visible from here — just.`,
    atmosphere: "Cold, damp. The smell of wet bark and dead leaves. Something moves in the fog."
  },

  "forest_camp": {
    img: "rangers_camp",
    detail: `The camp consists of a fire ring, a bedroll frame of cut branches, and a canvas lean-to that has been standing long enough for moss to start growing on it. A ranger's bow hangs from a peg hammered into a tree trunk. A forest cloak is draped over the bedroll frame.

Whoever made this camp was competent — the site is sheltered, dry, hidden from the main path. They knew what they were doing. The fire ring has not been used in weeks.

There is no sign of struggle. No sign of departure either. The camp was simply stopped in the middle of being lived in, as if the occupant stepped away for a moment and did not come back.`,
    atmosphere: "Still. The lean-to filters wind. Birdsong — but not close."
  },

  "ashwood_deep": {
    img: "deep_ashwood",
    detail: `The Deep Ashwood is where the forest becomes itself. The trees are older here, their roots breaking through the soil in ridges wide enough to trip over. The canopy closes overhead — light reaches the floor in columns rather than broadly, so that the forest exists in alternating bands of dim and dimmer.

Something large moves between the trunks at the edges of sight. It has been moving since you entered. It does not come closer. It does not stop.

The worn path east leads to Ashford Village — the trees thin as you approach, and you can see firelight through the gaps. The path south follows the ground as it gradually softens toward the swamp border.`,
    atmosphere: "The forest makes sounds — wind, settling wood, something breathing that you cannot locate."
  },

  "forest_ruins": {
    img: "room_forest_ruins",
    detail: `The ruins predate the forest, which is difficult to explain — the trees have grown through the walls in places, their roots lifting stones that must weigh hundreds of pounds. Whatever was built here was built before Ashwood was Ashwood.

Moss covers every surface. The walls that still stand lean at angles that should not be stable and have been that way long enough that they probably are. An altar at the centre of the largest room still holds an enchanted gem that glints even in the filtered forest light — something in the stone resists weathering.

The stone underfoot is different from the surrounding rock. A scholar once said it was not native to this region. They did not elaborate on where it came from.`,
    atmosphere: "Utterly quiet — the forest noise stops at the ruin walls. The gem hums at a frequency you feel rather than hear."
  },

  "swamp_border": {
    img: "room_swamp_border",
    detail: `The ground gives way here — not suddenly but progressively, each step from the forest into the swamp sinking a little more than the last until the soil becomes mud and the mud becomes standing water. Logs bridge the worst sections, worn smooth from use by things heavier than humans.

Serpents sun on the logs in good weather, coiled with the patience of animals that do not need to hurry. They slide into the water if approached — not out of fear, but out of preference. The water is dark and still.

The smell changes completely at the border. Forest becomes something older and wetter and less welcoming.`,
    atmosphere: "Humid, rich with decay. The smell of still water and growing things rotting into each other."
  },

  "swamp_heart": {
    img: "heart_of_the_swamp",
    detail: `The island at the heart of the swamp is dry ground barely large enough to call an island — a raised spit of firmer earth that the bog has not managed to reclaim. A watchtower stood here once. The lower third is intact; the rest sank over decades until only the stump remains, leaning toward the water at a terminal angle.

Deepwood roots grow through the island soil, which makes it firmer than it should be — the roots act as a lattice beneath the ground. Rare and valuable. Mira has been trying to source them for a year.

The Bog Witch has been here longer than anyone can establish. The island may be dry because of her, or she may be here because it is dry. Nobody has asked.`,
    atmosphere: "Dense, still air. Insects. The sound of water settling. Smoke from somewhere, though there is no visible fire."
  },

  // ── Dungeon Upper ─────────────────────────────────────────────────────────
  "dungeon_entrance": {
    img: "room_dungeon_entrance",
    detail: `The dungeon entrance was originally a cellar — you can see the outline of wine rack brackets in the stone at the top of the stairs, and the first few steps are finished in the same limestone as the building above. Then the architecture changes. Below a certain point the stone is different, older, cut by different tools or perhaps not cut at all but worn.

The iron-banded doors that once sealed this entrance were torn from their hinges. The damage is old — the torn brackets are corroded, the wood splinters long since rotted. Whatever broke through did so long ago.

The stairs descend into darkness that your eyes take time to adjust to, and when they do, it is not entirely reassuring.`,
    atmosphere: "Cold air rises from below. Damp stone, old iron, and something else — organic, faintly sweet in a way that is not pleasant."
  },

  "dungeon_hall": {
    img: "room_dungeon_hall",
    detail: `The main hall of the dungeon is the highest-ceilinged space below ground — a vaulted corridor that once served as the primary access route for whatever institution used these levels. The torches in the wall brackets are not the original ones; someone replaced them at some point, though that point was still decades ago.

Against one wall, largely undisturbed, lies Aldwyn's satchel. It was not dropped in a hurry — it was placed there, upright, the clasp fastened. The significance of this depends on what you know about Aldwyn.

The hall connects to every other section of the upper dungeon. In the dungeon's working days, this would have been a busy place. Now the foot traffic is mostly undead, which is quieter but less comfortable.`,
    atmosphere: "The torches gutter even with no draft. Sound carries in ways that make the hall feel larger than it is."
  },

  "dungeon_armory": {
    img: "room_dungeon_armory",
    detail: `The armory still smells of oil and metal from a hundred years ago — stone holds scent the way nothing else does. The weapon racks are rotted to frames, the leather straps that held blades dissolved to dust. What was stored here is mostly gone, taken by the dungeon's current occupants or by previous adventurers.

One chest remains intact — the lock was smashed rather than picked, which suggests whoever opened it was strong rather than patient. It holds what it holds now. The original contents are someone else's problem.

An armored skeleton stands at the north end of the room with the posture of someone who is still, technically, on duty.`,
    atmosphere: "Cold and metallic. The smell of old iron lingers in the stone."
  },

  "dungeon_well": {
    img: "the_stagnant_well",
    detail: `The well chamber was not built for water. The shaft descends further than it should — you cannot hear anything when you drop a stone in, which means it goes down further than any practical well would need to. The murals surrounding it on three walls depict what is clearly a ritual, told in panels from left to right.

The left panel shows a gathering. The right panel shows what was raised. The middle panels — the actual process — have been deliberately defaced, the stone gouged away. Someone knew what was depicted and made sure it could not be replicated.

The risen cultist in this room is not the worst thing that came from that well.`,
    atmosphere: "A faint draft rises from the well shaft. Cold, and carrying a smell that has no name."
  },

  "crypts": {
    img: "ancient_crypts",
    detail: `The crypts were designed to hold the dead permanently. The stone sarcophagi are cut from single blocks, the lids fitted and sealed with lead. The seals were not enough.

Several lids have been pushed aside — not shattered, not pried open, but displaced from the inside by steady pressure over time. The sarcophagi that were opened this way are empty. What they contained has redistributed itself throughout the dungeon, which is the polite way of explaining the current infestation.

The silver ring on the floor near the main aisle was dropped rather than placed — it rolled under a sarcophagus and was forgotten. By whom, and why they had it, and where they went, is not recorded.`,
    atmosphere: "Absolute silence except for your own movement. The air is perfectly still."
  },

  "crypt_deep": {
    img: "the_sealed_vault",
    detail: `The sealed vault at the deepest point of the crypts was sealed for a reason that was never written down — a deliberate omission, which is its own kind of record. The iron door was not broken down from outside. It was blasted open from within.

The sarcophagus at the centre of the vault glows blue from the void crystal sealed inside it — the crystal was placed there as a containment measure, which means someone understood what they were containing. The Crypt Lich that now occupies this space was either what was contained, or what moved in afterward.

The distinction may matter less than it seems.`,
    atmosphere: "Blue light from the sarcophagus. Cold that is not temperature — the cold of something wrong."
  },

  "prison": {
    img: "prison_block",
    detail: `The prison block runs east-west with cells on both sides — iron bars set in stone, locks that were good quality once. Several cells are open. Several are locked. The locked ones are worth examining only briefly and then leaving alone.

At the end of the block, a skeleton sits against the wall in the posture of someone who waited a long time. In its hand is a ring of keys. The keys fit the cells — all except the one at the far end, which takes a different kind of key and has a different kind of lock.

The ghost that patrols here was the guard on duty when the dungeon fell. It has not been told otherwise.`,
    atmosphere: "Iron and damp stone. The keys on the skeleton clink faintly when something passes."
  },

  // ── Dungeon Lower ─────────────────────────────────────────────────────────
  "mid_dungeon": {
    img: "the_descent",
    detail: `The Descent is where the dungeon changes character. Above this point the stonework is recognisably human — quarried, shaped, fitted. Below and around this junction the stone is different: older, darker, the walls smoothed by something other than tools.

The cold here is significant. Not temperature alone — the kind of cold that comes from proximity to things that have absorbed warmth for centuries and given nothing back.

Four directions branch from this point. North leads back up. East leads to the dragon's lair — you can smell the scorching from here. West leads to the void temple. South leads to the Lich's antechamber. Up leads to the temple crypt. This is the last point where turning back is simple.`,
    atmosphere: "Cold that settles into muscle. The shadows here move at the edges of vision."
  },

  "dragon_lair": {
    img: "dragons_lair",
    detail: `The cavern was not constructed — it was burned out. Centuries of dragon habitation have fused the stone into smooth black glass along the lower walls, cracked and re-fused enough times that the geology is entirely alien to anything that should exist at this depth.

The scorching on the ceiling tells the history of the space in blackened layers. The central depression in the floor holds the dragon's resting position, worn smooth by use.

The young dragon is at the far end, fixing burning amber eyes on you with the calm, comprehensive attention of something that has decided you are interesting. Not threatening — interesting. The distinction may change.`,
    atmosphere: "Hot. The air shimmers near the dragon. The smell of sulfur and hot stone."
  },

  "void_temple": {
    img: "room_void_temple",
    detail: `The void temple was not built by the dungeon's original builders. The architecture is wrong — the angles do not resolve correctly when you try to follow walls to corners, and the altar at the centre occupies more space than the room should be able to contain.

The cultists that chant before the altar are living, which makes them unusual in this dungeon. They are not aware of you in any conventional way — their attention is entirely on the altar and whatever it connects to. The violet energy pulsing from the altar surface is not light in the usual sense. It is absence, made visible.

The ancient tome on the altar floor was dropped, not placed. Someone changed their mind.`,
    atmosphere: "The chanting is subsonic as much as audible. The altar light makes shadows fall in wrong directions."
  },

  "boss_antechamber": {
    img: "antechamber_of_the_lich",
    detail: `The antechamber was designed as a statement. High ceilings, polished stone, alcoves holding armored figures that stand at rigid attention — they were ornamental once and are now functional in ways their makers did not intend.

The Lich's Champion stands before the north door like a keystone in armour. The red runes on its plate are not decorative. The mace it carries has been used recently — the head is clean, which means something cleaned it after use, which means something with enough cognition to consider cleanliness is responsible for it.

The black iron door to the north is not locked. It has not needed to be.`,
    atmosphere: "Perfectly still. The champion does not breathe. The silence has mass."
  },

  "boss_chamber": {
    img: "the_lichs_chamber",
    detail: `The Lich's Chamber is the oldest part of the dungeon. The walls hold the original construction — stone fitted so precisely that no mortar was used, assembled by someone who understood engineering at a level that has since been lost.

The arcane sigils burned into the floor glow in cold blue fire that has burned for two centuries. The throne of bones at the centre was constructed over time — you can see the layering, different bones from different eras added as the collection grew. On the throne sits the Dungeon Lich.

The Lich was once Malachar. You would not know that now. What looks at you from the throne carries no remaining trace of the man who built it.

The Crown on its skull is the only gold in the room.`,
    atmosphere: "Cold beyond cold. The blue sigil-light gives no warmth. The Lich has been waiting two hundred years. It is not impatient."
  },

  // ── Teleport Zones ────────────────────────────────────────────────────────

  // Volcanic Peak
  "volcanic_peak": {
    img: "crater_rim",
    detail: `The crater rim stands at the edge of a caldera that has been active for ten thousand years and shows no signs of stopping. The black rock underfoot is new — cooled lava from the last flow, which happened within living memory. Below the rim, rivers of molten stone move with the slow certainty of things that have never been stopped.

Fire elementals patrol the ridge in patterns that suggest territory rather than purpose. They do not respond to speech or gesture. They respond to proximity and to threat, in that order.

The heat at the rim is survivable. The heat below the rim is not a question worth testing.`,
    atmosphere: "The air shimmers with heat distortion. The sound of distant stone cracking under thermal stress."
  },

  "volcanic_tunnels": {
    img: "superheated_tunnels",
    detail: `The lava tubes beneath the crater rim are the dungeon equivalent of veins — channels cut by ancient flows, repurposed by creatures that require extreme heat to function. The walls glow in orange seams where active lava runs close to the surface, separated by inches of older rock.

Strange runes cover the tunnel walls — not carved but burned in, as if a finger of fire traced them. They predate any recorded civilization and have not been translated. The researchers who attempted it described the process as making them feel watched.

The Rock Wyrm treats the stone of these tunnels as water — it surfaces, submerges, travels through solid rock with the ease of something that does not experience matter as a barrier.`,
    atmosphere: "Oppressive heat. The runes pulse with their own dim light. The floor vibrates with geological activity."
  },

  "volcano_boss": {
    img: "the_magma_throne",
    detail: `The Magma Throne chamber is a cathedral of cooling stone and ancient heat — the ceiling lost in darkness above, the floor a crust over active magma that flexes subtly under weight. The Throne itself is a formation of cooled lava that accumulated into a seat-like structure over centuries before something decided to use it as one.

The Flame Titan is what happens when volcanic rage concentrates. It is not intelligent in any way that translates to conversation. It is a fusion of geological process and elemental fury, compressed and directed. Its attention, once fixed on you, is complete.

The heat in this room is a physical pressure.`,
    atmosphere: "The air itself burns. Every breath is work. The Titan's presence makes the crust flex."
  },

  // Frozen Tundra
  "frozen_tundra": {
    img: "ice_plains",
    detail: `The ice plains extend to every horizon without feature. Snow has covered whatever was here before so completely and for so long that the landscape has forgotten it had other options. The cold is not weather — it is climate, old and established and entirely indifferent.

Frost wolves circle at the far edge of vision, never quite approaching, never quite retreating. Their fur is thick enough that they appear white even against the snow, which is probably the point. They are patient in a way that suggests they understand how the cold affects prey.

Ice wraiths move through the snow without disturbing it. They are cold given motion. The temperature drops further when they approach, which seems impossible, but is measurable.`,
    atmosphere: "Wind that cuts through layers. The sound of it is the only sound. White in every direction."
  },

  "frozen_cave": {
    img: "room_frozen_cave",
    detail: `The cave entrance is easy to miss — the ice over it is translucent rather than opaque, and the interior light (there is interior light, though no obvious source) makes it glow blue-white in a way that the eye registers as snow rather than void.

Inside, the ice is architectural — formations that have grown over centuries into shapes that look constructed, though they are not. Blue-white walls that refract light in multiples of its original intensity.

Something massive occupies the back of the cave. It is breathing, which creates a regular fog-pulse at the cave mouth. It is sleeping, which is fortunate. The Yeti at rest is the size of a barn. Awake, it fills the cave entrance entirely.`,
    atmosphere: "Cold so severe it slows thought. The interior light has no source. The Yeti's breathing is the loudest sound."
  },

  "ice_fortress": {
    img: "ice_fortress_gates",
    detail: `The Ice Fortress was built with magic rather than labor — the walls are single pieces of ice, grown in place over years by the Frost Queen's will, shaped by temperature and pressure into something more durable than carved stone. The banner above the arch is frozen mid-flutter, preserved in the same ice as the walls.

The Frost Knights at the gate have been standing here since the fortress was built. They do not patrol. They do not speak. They assess everything that approaches with eyes that burned blue before the cold reached them, and blue after. The cold did not extinguish that light.

The gate arch leads north to the throne room. South leads back to the plains.`,
    atmosphere: "Dead calm inside the fortress walls. The cold here is the Frost Queen's cold — deliberate and absolute."
  },

  "frost_throne": {
    img: "the_frost_throne",
    detail: `The throne room of the Ice Fortress is white. Every surface — floor, walls, ceiling, throne — is ice so pure it appears white rather than clear. The Frost Queen is encased in a shell of living ice that has grown around her over four centuries, thickening with each year.

She is still in there. The pale blue eyes that regard you from within the ice are active, aware, and entirely without warmth in every sense of the word. The ice has not consumed her. She and the ice have reached an arrangement.

The Crown of icicles above her head reforms if broken. This has been tested. The Crown does not consider testing a meaningful threat.`,
    atmosphere: "Absolute cold. The silence is total — sound freezes before it travels. The Queen's eyes follow you."
  },

  // Sky Realm
  "sky_realm": {
    img: "cloud_platform",
    detail: `The cloud platforms of the Sky Realm are condensed — solid enough to walk on, soft enough that footsteps leave impressions that slowly fill. The gaps between platforms show sky in every direction, which means sky below as well as above.

Wind spirits drift between the platforms with the randomness of weather given form. They are not aggressive by nature. They become aggressive by proximity.

Thunder Hawks ride thermals between platforms with the ease of creatures born to it — wingspans that block the sun when they pass overhead. At this altitude, the sun is closer than it should feel.`,
    atmosphere: "Wind from every direction. The air is thin and cold but luminous — light comes from everywhere at once."
  },

  "sky_ruins": {
    img: "fallen_sky_ruins",
    detail: `The ruins suspended in the Sky Realm predate the realm itself — they were built on the ground, wherever the ground was that they stood on, before something lifted them. The stone arches float in configurations that defy structural logic, connected by nothing visible, stable by virtue of having been stable for long enough that gravity has given up arguing.

The runes carved into the stone glow faintly with absorbed sunlight. They are not the same runes as the dungeon — different hand, different purpose, different age. The Storm Feathers scattered among the ruins are fresh — the Thunder Hawks use the ruins as roost sites.`,
    atmosphere: "The wind through the arches creates harmonics. A low chord that changes direction with the weather."
  },

  "storm_citadel": {
    img: "room_storm_citadel",
    detail: `The Storm Citadel is not a building. It is weather, given the permanence of architecture — the walls are cloud and compressed air and electrical potential, structured by the Storm God's presence into something that functions as enclosure without technically being solid.

The Storm God regards you with contempt that is not personal. It regards everything this way. It is a force of nature that became aware enough to be offended by the existence of things smaller than itself, and has maintained that offense for as long as the Sky Realm has existed.

The Aegis it carries was never crafted. It coalesced — the accumulated deflection of ten thousand lightning strikes, compressed into something wearable.`,
    atmosphere: "Ozone so thick it tastes metallic. The static raises every hair. Thunder as ambience."
  },

  // Shadow Realm
  "shadow_realm": {
    img: "the_threshold",
    detail: `The Threshold is the point where the Shadow Realm tears through into perceivable space. The tear is not dramatic — it is simply a place where what should be solid wall is not, where the stone of the edges exists and the centre does not, replaced by something that looks like darkness but is darker.

Shadow demons emerge from the walls with a sound like fabric tearing. They are not summoned — they live in the material of the walls and push through when conditions suit them. The conditions that suit them are unclear. They suit them frequently.

The Threshold is unstable in ways that physics does not have good language for.`,
    atmosphere: "Reality has a texture here. The air feels like it is being processed rather than breathed."
  },

  "nightmare_forest": {
    img: "room_nightmare_forest",
    detail: `The Nightmare Forest is the Shadow Realm's version of Ashwood — the same structure, dark trees in dense arrangement, ground covered in old growth. The differences are that the trees are dead and black, the shadows move independently of their sources, and the screams that echo here have no identifiable origin.

The Banshee's territory includes this forest, though she treats territory loosely — she appears where her screaming takes her, which is unpredictable. The Dark Treants are slower but more fixed in their movements, rooted enough that avoidance is possible if you pay attention.

The shadows that move on their own do not have bodies attached to them. This is their natural state.`,
    atmosphere: "The screaming is present or absent, never in between. The moving shadows cross underfoot."
  },

  "void_citadel": {
    img: "room_void_citadel",
    detail: `The Void Citadel is the Shadow Realm's terminus — the point where shadow becomes void, where the darkness stops being absence-of-light and becomes absence-of-presence. The walls are crystallised darkness. The floor is crystallised darkness. The throne is crystallised darkness, and the Void Emperor sits upon it.

The Emperor is not a creature that became powerful. It is the Shadow Realm's power given the minimum possible amount of form necessary to have preferences. Its preference is continuation. Its secondary preference is expansion. You represent a potential obstacle to both.

The Sigil it bears is not an accessory. It is its signature on the material world.`,
    atmosphere: "No light of any kind. The darkness is complete and physical. The Emperor's presence is felt rather than seen."
  },

  // Crystal Caverns
  "crystal_caverns": {
    img: "room_crystal_caverns",
    detail: `The Crystal Caverns are the product of millions of years of mineral deposition, accelerated and shaped by something magical that occurred in the deep geological past and has not been identified. The formations tower fifteen meters in places — pillars and clusters of luminescent crystal that generate their own light from stored energy, no source required.

The light is beautiful and disorienting. Reflections multiply in the crystal faces until the cavern appears infinite, every direction appearing to continue further than it does.

Crystal golems move through the caverns with the certainty of creatures that have never known darkness. The gem spiders are harder to see — their gemstone abdomens reflect the crystal light, making them appear as light sources rather than predators.`,
    atmosphere: "Brilliant, prismatic light that shifts with movement. Silence except for the faint crystalline tones when formations resonate."
  },

  "gem_vault": {
    img: "the_gem_vault",
    detail: `The Gem Vault is the heart of the Crystal Caverns — a natural chamber where the densest mineral deposits accumulated, raw gemstones covering every surface in layers. Prismatic shards, void crystals, forms that do not correspond to any catalogued mineral.

The Diamond Guardian exists to prevent removal of the vault's contents. It is not aggressive in a standard sense — it does not pursue beyond the vault boundary. Within the vault, it is absolute. The diamond that comprises it has never been sourced to any known deposit.`,
    atmosphere: "The light here is almost painful — every surface reflects and magnifies. The Guardian's presence shifts the light patterns."
  },

  "crystal_depths": {
    img: "crystalline_depths",
    detail: `The Crystalline Depths are where the cavern's magic concentrates. The Prism Titan rose from the floor over thousands of years — crystal formations developing awareness, then purpose, then the specific purpose of guarding what accumulated below it.

The Titan does not communicate. It rises from the crystal floor like something that grew rather than arrived, and its presence refracts all available light into patterns complex enough that looking at it directly becomes difficult. The patterns it creates are not random. Researchers who have studied them from a distance believe they encode something. No one has decoded it.`,
    atmosphere: "The light is overwhelming. The Titan's presence bends it into geometry that should not be possible."
  },

  // Haunted Keep
  "haunted_keep": {
    img: "keep_courtyard",
    detail: `The keep courtyard was once a functional space — stables, a well, a smithy in the east corner. The structures are still there, partially. The overgrowth has been at them for three hundred years and is winning on all fronts.

The wailing spirits that patrol the courtyard move in patterns that correspond to the original layout — they are still performing their functions, whatever those were. A wailing specter crosses the courtyard on a path that would take it through the stable door, if the stable door still existed.

The keep's silence is not silence. It is sound that has been produced for so long it has become part of the air.`,
    atmosphere: "The wailing is both ambient and specific. The overgrowth muffles but does not eliminate it."
  },

  "keep_dungeons": {
    img: "room_keep_dungeons",
    detail: `The Keep's dungeon is below the courtyard — cells hewn from the bedrock beneath the castle foundation, which means they predate the castle itself. Someone was imprisoning people here before the Keep was built. The records of why, if they existed, are gone.

The prisoners who remain are undead, still in their cells, still wearing what they wore when they were alive. The chains are original — three hundred years old and still functional because nothing down here has been disturbing them.

The Chained Revenant drags its chains with a sound that carries through stone. You can hear it before you enter.`,
    atmosphere: "Below-ground cold. The chain sound echoes. The air has never been changed."
  },

  "keep_great_hall": {
    img: "the_great_hall",
    detail: `The Great Hall of the keep is the largest space in the structure — long enough that the far end is in dim light even with the sconces burning, and the sconces here do burn, maintained by something that has not given up on the pretense of habitation.

The head table at the far end is set. The places are laid with three-hundred-year-old tableware, dust-covered and corroded, arranged with the formality of a dinner that is perpetually about to begin.

At the head of the table sits the Death Baron — the lord who refused to die, whose title became a joke in the capital, whose keep was sealed to let the problem resolve itself. The problem did not resolve itself. It dressed for dinner.`,
    atmosphere: "The sconces burn with no visible fuel. The hall is cold despite them. The Baron's presence makes the formal setting grotesque."
  },

  // Astral Sea
  "astral_sea": {
    img: "astral_sea_shallows",
    detail: `The Astral Sea is the medium through which things travel between planes — a space that is not quite space, light that is not quite light, filled with the residue of everything that has ever moved between worlds. The silver light here has no source. It comes from everything equally.

The shallows are called shallow relative to what is further in, not relative to any floor — there is no floor. Astral sharks swim through the medium as if it were water, which is not entirely metaphorical. Plane Walkers drift through it with the ease of creatures that have been traveling it for lifetimes.

The horizon, in every direction, is infinite.`,
    atmosphere: "Weightless. The light is constant and sourceless. Sound travels differently — too far, too clearly."
  },

  "astral_wreckage": {
    img: "room_astral_wreckage",
    detail: `The Astral Sea preserves what it catches. The wreckage here is from civilizations that lost their planes — the worlds are gone, but what was traveling between them when the worlds ended ended up here instead, drifting in the silver light for as long as the sea has existed.

The Githyanki pirates board the wrecks with practiced efficiency. They have been working the astral wreckage lanes for generations, extracting value from the remnants of dead civilizations. They are not hostile by default. They are hostile by circumstance, and circumstances arise frequently.

The ancient tomes and enchanted gems found in the wrecks are from places that no longer exist.`,
    atmosphere: "The silver light flickers near the wreckage. The ships settle as if in water — slowly, with groaning."
  },

  "astral_depths": {
    img: "the_astral_vortex",
    detail: `The Astral Vortex is where the Sea churns into itself — a perpetual rotation of planar energy that has been moving since the planes first separated. The light here is different: not the ambient silver of the shallows but something that bends around the vortex's rotation, making depth and distance impossible to gauge.

The Astral Leviathan has been circling the vortex since before recorded history. It is the oldest creature encountered in any accessible plane. Its scale makes the vortex appear manageable by comparison — the vortex, which is large enough to consume a city.

The Leviathan does not attack. It circles. Then it notices you. Then it considers you. The consideration is uncomfortable.`,
    atmosphere: "The rotation is felt more than seen — a pull, a disorientation. The Leviathan's passage displaces the medium."
  },

  // Void Sanctum
  "void_sanctum": {
    img: "void_sanctum_antechamber",
    detail: `The Void Sanctum Antechamber is at the edge of existence — not metaphorically, but in the literal sense that the material world has become thin here, stretched over the void like skin over bone. The walls look solid because they are still technically there, but light travels through them differently, and your hand, if pressed against them, would meet less resistance than stone should provide.

Void Wraiths patrol the passage — not from instruction but from proximity. They are what void becomes when it is adjacent to material space long enough. They do not have intentions. They have presence, and their presence erases.

The passage north leads to the Inner Sanctum. The passage east leads to the Library.`,
    atmosphere: "The material world is thin here. Cold that is the absence of heat rather than the presence of cold."
  },

  "void_library": {
    img: "library_of_the_void",
    detail: `Every book ever lost is here — consumed by the void when it was lost, preserved in the void's version of preservation, which means present and unreachable simultaneously. The shelves extend beyond sight in a space that is larger than the structure containing it by an amount that ruins measurement.

The Void Scholars guard the library with the dedication of people who discovered something they considered worth protecting and then lost the capacity to leave. They are still reading. The books they hold shift contents when you look away from them.

The ancient tomes that can be physically retrieved are the ones the void has not yet fully claimed. They are still in the process of being consumed. They are still, for now, readable.`,
    atmosphere: "The library has the quality of a dream of a library — almost right. The scholars' presence is the most solid thing here."
  },

  "sanctum_inner": {
    img: "inner_sanctum",
    detail: `The Inner Sanctum is nothing made into a room by the fact of being entered. The walls are void. The floor is void. The ceiling is void. These are functional descriptions — there are surfaces here, and they behave as walls, floor, and ceiling — but they are not made of anything that physics accounts for.

The Void God is here. It is not in the room — it is the room. The primordial emptiness that became aware of itself over the course of cosmic time, that developed the preference for continuation and the secondary preference for expansion, that the entirety of the Void Sanctum exists to protect — it is here, and it has noticed you, and its noticing is the most complete attention you will ever receive.

Void God's Essence, if retrieved from this place, will be the condensed consciousness of something that existed before your world had a name.`,
    atmosphere: "The nothing here is total. There is no atmosphere. There is only the God, and its attention, and what you do next."
  },

  // ── King's Road — Main Trail ──────────────────────────────────────────────
  "trail_crossroads": {
    img: "room_trail_crossroads",
    detail: `A junction where the Ashwood path splits, marked by a traveller's cairn — a column of stacked flat stones, each one left by someone who passed through and made it. The pile is taller than it should be. A lot of people have come this way. Not all of them continued east.

The King's Road continues east toward Ashford Village, the stones underfoot worn smoother as trade traffic picked up in the last decade. A boggy side-track cuts south, unmarked, disappearing into dark undergrowth within thirty feet. The trees around the cairn are old enough to have opinions.

A crude arrow has been scratched into the top stone. It points east. Someone considered pointing it south and decided against it.`,
    atmosphere: "A crossroads smell — horse, old mud, pine resin, and the faint sulfur of the bog to the south."
  },

  "trail_ravine_path": {
    img: "room_trail_ravine_path",
    detail: `The King's Road narrows here to a ledge path along the edge of a ravine. The drop to the left is not immediately visible through the undergrowth but you can hear it — running water far below, the hollow echo of open space. The path is wide enough for one person, or one horse, but not both at once.

Loose shale collects at the verge. Travelers who hurry this section tend to find out about the drop the hard way. The rope bridge ahead spans a narrowing of the ravine — the ropes are newer than the planking, which is either reassuring or alarming depending on who installed them.

A ledge cuts east and down, toward the ravine floor. The footing there is worse. Whatever goes down that way does so by choice.`,
    atmosphere: "Cold updraft from the ravine below. The sound of water and the creak of the rope bridge ahead."
  },

  "trail_hillcrest": {
    img: "room_trail_hillcrest",
    detail: `The road climbs onto a low hill and for a few minutes the canopy opens. The view west is forest — the Ashwood stretching back toward Shadowmere, grey-green and impenetrable. The view east shows the first smoke of Ashford's chimneys, still hours away, but visible.

The northern ridge is lined with barrow mounds — low earthen humps, some marked with rough standing stones, some cracked open. The dead here are old enough that their names are lost, but whatever animated them is not. The local rule is: don't go near the mounds after dark. The rule exists because someone went near the mounds after dark.

The path is good here. Wide, dry, stone-paved in places. Someone maintained this road once, cared about it. That person is gone.`,
    atmosphere: "Wind from the west. The smell of open air and old earth. The mounds are quiet, for now."
  },

  "trail_old_camp": {
    img: "room_trail_old_camp",
    detail: `What remains of a soldier's waycamp — the kind placed every few hours along supply routes, long before this road had bandits and long after it stopped having soldiers to maintain them. The fire pit is cold. The iron stake ring is rusted through in three places. What was once a canvas shelter is a tangle of rotted cloth and collapsed poles.

Someone has been here recently. The ash in the fire pit has been disturbed. A boot print in the mud near the pit is fresh enough that the edges haven't dried. Whatever made it wore boots with a distinctive heel pattern, military, the kind issued to frontier garrisons ten years ago.

A trail of broken undergrowth leads north. The break is deliberate — someone clearing a path, not walking through. They wanted to be able to come back fast.`,
    atmosphere: "Abandoned camp smell — cold ash, rotting canvas, damp earth. Something moved through here within the last few hours."
  },

  "trail_valley": {
    img: "room_trail_valley",
    detail: `The King's Road dips into a valley and the temperature drops with it. Morning mist sits on the valley floor in heavy banks that don't quite burn off even by midday. A stream cuts across the path at a ford — shallow enough to cross, cold enough to be unpleasant about it.

The undergrowth on either bank is thick with rooting boars. They are very large. They are not afraid of people. The largest one, visible at the tree line, has tusks long enough to do structural damage to a cart. It watches without moving. The others continue to root. Their indifference is the most threatening thing about them.

The burned hamlet is visible east, through a thinning of the trees — a grey smudge against the forest that your eyes keep trying to reinterpret as something less grim.`,
    atmosphere: "Mist, cold stream water, the sound of rooting. The boar at the tree line has not blinked."
  },

  "trail_burned_hamlet": {
    img: "room_trail_burned_hamlet",
    detail: `Three foundations, a crumbled well, and a single chimney stack standing alone like a monument to nothing. The fire that took this place was thorough — not accidental. Accidental fires leave more. This one had direction. The scorch patterns on the stones radiate from multiple points, and the points are where people lived.

A woman sits among the ruins on what was once a doorstep. She does not look up when you arrive. She is sifting through ash with her bare hands, slowly, methodically, looking for something specific. The plague ghouls that stir in the deeper ash piles seem to leave her alone. Whether that is by choice or luck is unclear.

The road continues east. The smell of char does not leave you for a while.`,
    atmosphere: "Cold ash and char. The quiet specific to places where something final happened. The ghouls are not yet aware of you."
  },

  "trail_stone_bridge": {
    img: "room_trail_stone_bridge",
    detail: `A stone arch bridge, old enough to have its own reputation. The mortar between the stones is dark with age and moss. The keystone has a face carved into it — worn almost flat by weather, but the outline of a mouth and two empty eyes remain. Local travelers know the face. They do not name it.

Below the arch, the river is dark and fast. The trolls that live under the bridge are heard before they are seen — a wet, shuffling movement under the arch, the sound of something large adjusting its position. The bridge itself is structurally sound. The trolls have not damaged it. They seem to understand that the bridge is why travelers come close enough to be worth anything.

The road continues east onto firmer, drier ground.`,
    atmosphere: "River cold, damp stone, the smell of wet troll from below. The carved face on the keystone appears to be watching the water."
  },

  "trail_overgrown_road": {
    img: "room_trail_overgrown_road",
    detail: `This was a proper road once. The original stone paving is still here, just buried under a decade of vine growth and root heave that cracked the surface into irregular islands. Traveling it feels like walking across a frozen river — solid, probably, but with the persistent sense that the ground isn't quite committed to your weight.

The vines are not natural. They grow at the wrong angles, against gravity in places, and the stone constructs wrapped in them move with the slow deliberate motion of things that have nowhere to be but are going there anyway. The assassin vines overhead hang perfectly still until something passes beneath them. The stillness is studied. They have practiced it.

A traveler's pack, half-consumed by plant growth, sits off to one side. Whatever it contained is gone.`,
    atmosphere: "Green light filtered through dense canopy. The creak of moving vegetation. Something here has learned patience."
  },

  "trail_watchtower": {
    img: "room_trail_watchtower",
    detail: `A watchtower at the road's final bend before Ashford — built when the road was new and the garrison had budget for forward positions. The upper level cracked open in some past catastrophe, splaying the top like a stone flower. Gargoyle sentinels, which were decorative in another life, now perch on the broken rim and patrol the rubble.

From here, through a gap in the canopy, Ashford Village is visible to the east. Smoke, a cluster of rooftops, the glint of the well in the square. Twenty minutes of walking. The tower represents the last hard stretch — after this the road improves, the trees thin, and the world opens up.

The wraith that occupies the tower's interior is the spirit of a garrison soldier who has not realized the garrison disbanded. It holds its post. It does not let things pass without challenge.`,
    atmosphere: "Open wind where the tower's top once was. The smell of old stone and something colder. Ashford is right there."
  },

  "trail_fields": {
    img: "room_trail_fields",
    detail: `Open farmland, or what farmland looks like when it has been abandoned for long enough to stop apologizing for it. The fields are overgrown but not wild — the grid of old boundary ditches is still visible, and the soil turned over every few years by something, even if not by a plow.

Ashford Gate is east, the village visible and real and finally close. A few villagers work a field south of the road, close enough to see but far enough to watch without speaking. They are watching. They are assessing. People who make it this far along the trail tend to be either capable or lucky, and Ashford has learned to distinguish between the two.

The ruins of an old farmstead are visible south. Nobody from the village goes there.`,
    atmosphere: "Open sky, farm smell, wind without obstruction. The gate of Ashford is the first human architecture you've seen in hours that isn't ruined."
  },

  // ── Ashford Village Expansion ─────────────────────────────────────────────
  "ashford_market_row": {
    img: "room_ashford_market_row",
    detail: `A short lane of specialist shops running east from Ashford Square — the kind of street that grew organically as the village needed things, each building added when someone with a skill showed up and stayed. The result is architecturally inconsistent and commercially functional.

The general store is east, its sign weathered to near-illegibility. To the north, the heat and hammer-sound of Torvar's Crucible is unmistakable — the kind of forge work that puts vibration in the cobblestones. South, Sister Maren's apothecary presents a clean whitewashed face that contrasts with everything around it.

The market row is where Ashford does its practical business. The square is where it pretends to socialize. The distinction is generally understood.`,
    atmosphere: "Forge heat from the north, herb smell from the south, the mundane commercial smell of a working frontier village."
  },

  "the_crucible": {
    img: "room_the_crucible",
    detail: `Torvar's forge runs hotter than it needs to. The extra heat is intentional — he runs it hot to keep the metal honest. The forge itself is a double-bellows design he built from a schematic he won't show anyone, and it produces a consistent temperature that his work requires and that makes the room genuinely dangerous to stay in for long without purpose.

Finished weapons and armor hang on the walls at various stages of cooling. The plain ones are the good ones — Torvar considers surface decoration a distraction from edge geometry. A sign above the crafting bench is burned directly into the wood: CRAFTING COSTS GOLD. QUALITY COSTS SOMETHING.

The half-orc himself is usually at the anvil. The scars on his forearms are map of thirty years of work. He will tell you about any of them if you ask, but only in terms of what the piece was and what went wrong.`,
    atmosphere: "Intense forge heat. The smell of hot iron, coal, and quenching oil. The hammer rhythm is constant."
  },

  "arcane_vault": {
    img: "room_arcane_vault",
    detail: `Elyndra's shop is organized with a precision that borders on hostility toward disorder. Items are catalogued by enchantment type, then by power tier, then by provenance, and the shelves are labeled in a shorthand she developed herself. She will explain the system to anyone who asks. This usually ends the conversation.

The items themselves are remarkable — not the theatrical magic of adventure zone bosses, but the careful, useful magic of a scholar who has spent decades finding things that work. A ring that keeps its wearer precisely warm. A dagger whose edge never dulls. A cloak that reduces sound by exactly thirty percent.

The unmarked door north goes somewhere Elyndra prefers not to discuss, though she has clearly discussed it with whoever operates that space.`,
    atmosphere: "Faint ozone and old leather. The hum of active enchantments, just below hearing. Very organized."
  },

  "shadow_market_ashford": {
    img: "room_shadow_market_ashford",
    detail: `The room behind the unmarked door is small, low-ceilinged, and lit by a single lamp that Vex positions to illuminate the merchandise and leave his own face in shadow. This is not accidental. Vex does very few things accidentally.

The goods here are genuine — Vex does not sell counterfeits, on the grounds that counterfeits generate complaints and complaints generate attention and attention is the one thing he has consistently avoided. The prices are honest relative to acquisition cost, which in several cases was considerable.

He will not explain where anything came from. He will not ask where you are going with it. He considers this a professional courtesy extended in both directions.`,
    atmosphere: "Lamp-warm, close, and quiet. The smell of wax, leather, and something that came from somewhere it shouldn't have."
  },

  "deadwood_apothecary": {
    img: "room_deadwood_apothecary",
    detail: `Sister Maren's apothecary is clean in the way operating rooms are clean — not for comfort, but for accuracy. Every surface is scrubbed. Every container is sealed. Every label is written in the same hand at the same size with the same black ink, because inconsistency introduces error, and error in her work kills people.

The compounds she produces here are more advanced than anything available in Shadowmere. She has access to ingredients that require going places most apothecaries won't go — deepwood roots from the swamp heart, components from creatures that require serious fighting to find. She considers this part of the job.

She came to Ashford three years ago. She has not explained why she chose this particular frontier village. The villagers have learned not to ask.`,
    atmosphere: "Clean, sharp, herbal. The clinical precision of a space designed for work rather than commerce."
  },

  "guild_outpost": {
    img: "room_guild_outpost",
    detail: `The Ashford Frontier Guard outpost is the most structurally sound building in the village — Captain Holt's first act on taking command was to have it reinforced, because a garrison that can't hold its own headquarters isn't a garrison, it's a suggestion.

The map table dominates the room. The King's Road trail is marked in detail that took months to compile — every known bandit position, patrol route, and incident location represented by iron pins of different colors. Red pins are current confirmed threats. Black pins are incidents with no survivors. There are more black pins than Holt discusses.

The veterans who drill in the yard outside are not young. They are people who have survived enough frontier work to stop being surprised by it, which is the qualification Holt actually values.`,
    atmosphere: "Military order. The smell of oiled leather, wood polish, and candle wax. The drill yard sounds carry through the walls."
  },

  // ── Ashford Outskirts & Bandit Camp ──────────────────────────────────────
  "ashford_outskirts": {
    img: null,
    detail: `The eastern fringe of Ashford Village is where the village stopped trying. The original buildings are still partly standing — walls to head height, thatched roofs long gone, doorways standing open like questions. Bandits have moved into the shells of buildings that other people abandoned, which is an accurate description of how banditry works at every level.

The Frontier Guard outpost is visible north — a solid building, deliberately visible from here. Captain Holt wants the bandits to know exactly where the guard is stationed. The implication about how far they've been allowed to encroach is not lost on anyone.

The road east leads into the bandit camp proper. The guard at the entrance has stopped pretending to not know what the road leads to.`,
    atmosphere: "Neglect and threat in equal measure. The wind carries cook-fire smoke from the east."
  },

  "bandit_camp": {
    img: "bandit_camp",
    detail: `The bandit camp is built around the ruins of whatever was here before — a waypost, maybe, or a small holding. The bandits have reinforced what remained and added to it with the resourcefulness of people who cannot requisition materials legitimately: salvaged timber, salvaged stone, salvaged everything.

The Bandit King holds court in the largest structure, which he has furnished with the accumulated best of everything his people have taken from travelers on the King's Road. The throne of stolen goods is not ironic to him. It is an organizational statement about who has accumulated the most successfully.

A pile of obsidian shards and gold coins near the entrance represents recent take. Nobody has counted it yet. Nobody is in a hurry — this camp is not going anywhere.`,
    atmosphere: "Controlled chaos. The smell of wood smoke, leather, and the particular alertness of a camp that expects visitors but not welcome ones."
  },

  // ── Branch 1: Bogwood Trail ───────────────────────────────────────────────
  "bog_track_1": {
    img: "bogwood_track",
    detail: `The track south from the crossroads deteriorates quickly. Packed earth becomes soft ground becomes something that moves when you step on it. The trees change — the dry forest species give way to pale marsh birch and black elder, their roots half-exposed above brackish water.

Cultist markings appear on the trunks — not recent, but maintained. Someone comes through regularly to re-cut the symbols where weather has softened them. The symbols are in a dialect of void-script that predates the Void Sanctum itself. Elyndra would probably pay well to see them. The price of bringing her here is something else.

The bog deepens south. The croaking is omnidirectional. Something large displaced water a few minutes ago and the ripple rings are still reaching the edge.`,
    atmosphere: "Bog cold — wetter and heavier than forest cold. The smell of rot and standing water. The frogs have stopped."
  },

  "bog_track_2": {
    img: "room_bog_track_2",
    detail: `Knee-deep in places. The path, insofar as it is still a path, is marked by stakes driven into the bog floor — old stakes, dark with age, planted by whoever blazed this trail and never maintained since. Between the stakes the footing is guesswork.

The trees here are draped with moss so thick they look like sleeping creatures. Void symbols cover the trunks at regular intervals, getting more recent as you go south — these ones were cut within the year, some within the month. Someone is using this trail regularly. The cult activity in the deeper bog is not historical.

A torch bracket on one of the stakes is occupied. The torch burned down to nothing recently. Someone lit it and stayed until it went out.`,
    atmosphere: "Oppressive. The moss muffles sound. The water has no current. Things float here that you don't examine closely."
  },

  "bog_shrine": {
    img: "room_bog_shrine",
    detail: `A stone shrine half-submerged in black water, still standing because its foundations go deeper than the bog. The deity it was built for is not named on any surface — the cultists who maintain it know the name and consider the knowing itself a form of worship that does not require inscription.

Dark offerings float on the water around the shrine's base — food gone soft, cloth gone dark, objects that were once valuable and are now given back to something older than value. The water is still, which it should not be. Nothing disturbs the surface around the offerings.

A cave opening south of the shrine was not originally part of the structure. Something made it from inside.`,
    atmosphere: "Sacred and wrong in equal measure. The water around the shrine does not reflect light correctly."
  },

  "bog_cave": {
    img: "room_bog_cave",
    detail: `The cave is not geological. The walls are compressed bog — peat and clay and ancient organic matter pushed aside and packed smooth by something that needed space. The ceiling drips continuously. The floor is covered in a finger of black water that moves against the slope, toward whatever sits at the back.

The Bog Horror is the end point of a very long process. It began as bog accumulation, as all things in the deep marsh begin — layers of dead material pressing down on older dead material. At some point the concentration of void-adjacent cult energy in the surrounding area catalyzed something. The Horror is not intelligent. It is purposeful, which is worse.

The deepwood roots it has accumulated over decades are the only reason anyone comes this far.`,
    atmosphere: "Total dark broken only by faint bioluminescence in the cave walls. The sound of water moving against gravity."
  },

  // ── Branch 2: The Ravine ──────────────────────────────────────────────────
  "ravine_descent": {
    img: "room_ravine_descent",
    detail: `The descent into the ravine is a series of switchbacks cut into the rock face — too regular to be natural, too weathered to be recent. Someone built this path, probably for mining or quarrying, and then stopped needing it for that purpose. The new purpose is less organized.

Cave spiders have colonized every horizontal surface below ten feet of height. Their webs are architectural — thick suspension cables between anchor points, with the actual catching surfaces invisible until you walk into them. The spiders themselves are pale and fast, which is the combination you want least.

The walls close in quickly. By the time you are halfway down, the ravine rim is a thin line of sky directly above.`,
    atmosphere: "Cold upward air from the ravine floor. The creak of web cables in the wind. The spiders are aware of you."
  },

  "ravine_floor": {
    img: "room_ravine_floor",
    detail: `The floor of the ravine is a stream channel worn smooth over the kind of time that makes human concerns feel modest. The water runs fast in the center, clear over smooth stone, and the sound of it fills the enclosed space until you have to raise your voice to be heard.

Bioluminescent fungi cover the lower walls in patches of cold blue-white light that make the ravine navigable without torches but give everything a clinical, unsettling quality. The color is wrong for living things. The serpents that hunt here have adapted to it — their scales have the same blue-white tint at certain angles, which is either camouflage or coincidence.

A grotto entrance to the south is marked by a concentration of the fungi so dense it functions as a lamp.`,
    atmosphere: "Running water, cold stone, cold light. The echo makes sounds into other sounds. The serpents are watching the water."
  },

  "ravine_grotto": {
    img: "room_ravine_grotto",
    detail: `The grotto is a pocket in the ravine wall — a space where the limestone dissolved and left a chamber roughly circular, roughly ten meters across, lit by a skylight crack fifty feet up that shafts pale light into the center.

Crystal formations cover the walls, grown by centuries of mineral water moving through the limestone. They are extraordinary. They are also, in the upper registers, home to crystal beetles whose carapaces have the same mineral composition as the formations they nest in, and which do not distinguish between a territorial intrusion and a geological survey.

Old coins on the pool bottom are from multiple eras and at least four currencies. People have been coming here for a long time, leaving small things in the water the way people do at places that feel important.`,
    atmosphere: "Cathedral quiet. The shaft of light makes dust visible. The pool is perfectly clear to its bottom."
  },

  "ravine_crevasse": {
    img: "room_ravine_crevasse",
    detail: `At the ravine's deepest point the walls converge to a crevasse — a crack in the bedrock that descends past any practical measurement. The stream disappears into it. The cold that rises from it suggests the bottom is very far away and very different from here.

The Stone Leviathan has claimed this depth. It is part stone — the same limestone as the ravine walls, the same crystal inclusions as the grotto above — and part something older than the rock, some animating principle that geology does not account for. It has been here since before the ravine was a ravine, when this was all solid rock and it was sleeping inside it.

Being awakened was not an improvement to its disposition.`,
    atmosphere: "A cold that comes from below, carrying no smell, only depth. The walls vibrate at a frequency below hearing."
  },

  // ── Branch 3: Hill Barrows ────────────────────────────────────────────────
  "barrow_mound": {
    img: "room_barrow_mound",
    detail: `The northern ridge of the hillcrest is covered in barrow mounds — forty, perhaps fifty, arranged without the regularity of a planned cemetery but with the consistency of a tradition maintained across generations. Each mound is different in size and marking. The largest have standing stones. The smallest have nothing but the mound itself.

Several lids — stone slabs covering entrance shafts — have been pushed aside from below. The displaced earth around them is not fresh, but not old. The wights that emerged are the burial-guard type: slow, purposeful, hostile to the living by reflex rather than malice. They patrol between the mounds without apparent route.

A grave robber, caught mid-work and killed by the wights, sits propped against the largest standing stone. He has been there long enough that the wights have stopped paying attention to him.`,
    atmosphere: "Old burial ground silence. The kind of quiet that has been maintained by intent for centuries."
  },

  "barrow_entrance": {
    img: "room_barrow_entrance",
    detail: `The barrow hall beneath the main mound is a constructed space — dry-laid stone, corbelled ceiling, the walls dressed smooth and carved. The carvings depict the deeds of a king who has no name in any record, performing victories over enemies who have equally no names. The kingdom they existed in is not remembered.

Tomb guardians stand at the hall's four quadrant points — animated stone figures in stylized armour, holding stone weapons that are more than decorative. They have stood here since the barrow was sealed. They will stand here after everything built above ground is gone.

The air is stale but not foul — the barrow breathes through cracks in the mound, slowly, the way old things breathe.`,
    atmosphere: "Stone cold. The carvings watch without eyes. The tomb guardians' feet have pressed permanent marks into the floor."
  },

  "barrow_vault": {
    img: "room_barrow_vault",
    detail: `The vault at the barrow's heart is where the king's portable wealth was interred — not the crown, not the weapons, but the grave goods: cups, plates, personal ornaments, the things that were daily-life objects elevated to ritual by being buried with someone important.

Centuries of tarnish have turned silver black and gold dull. The coins on the floor are unreadable. The personal ornaments — rings, pins, clasps — lie where they were placed and have not moved since. One of them is a tarnished locket with a pressed flower inside, obviously not from this era, obviously placed here recently by someone who had a reason to put it somewhere no ordinary person would look.

The Barrow King's presence fills the north passage. He has not emerged yet. He is deciding.`,
    atmosphere: "Grave-goods smell — old metal, old cloth, old ceremony. The locket catches what little light reaches here."
  },

  "barrow_depths": {
    img: "room_barrow_depths",
    detail: `The throne room below the vault was not part of the original construction. It was added later — the stonework is different, the ceiling higher, the proportions of a space designed for something that chose this place rather than was placed in it. The Barrow King is not a burial; he is a residence.

He sits on a throne of compacted grave goods — a chair built from what the centuries brought down to him. His burial plate is intact and still fits. The sword beside the throne is not ceremonial. The empty eye sockets hold a specific type of awareness that makes clear he remembers being alive and has not forgiven death for happening.

The chamber walls are covered in the names of every person who has entered this place. Most names end mid-word.`,
    atmosphere: "The cold here is his cold — not temperature but presence. The names on the walls are readable. Yours is not there yet."
  },

  // ── Branch 4: Bandit Hideout ──────────────────────────────────────────────
  "bandit_hideout": {
    img: "room_bandit_hideout",
    detail: `A fortified outpost with the practical, functional ugliness of something built to work rather than to impress. Sharpened stakes form a perimeter. A crude watchtower of lashed timber overlooks the approach. The sentinels are positioned correctly — sight lines overlap, there is no angle of approach that isn't observed.

These are not the improvised bandits of a desperate winter. The Road Captain runs this operation with military discipline, because he had military training and the good sense to apply it to banditry. The cutthroats and sharpshooters here are professionals in a specific and criminal sense.

A notice board inside the perimeter posts patrol schedules and incident reports. Captain Holt would very much like to see that board.`,
    atmosphere: "Organised violence. The smell of cook fire, oiled weapons, and the particular alertness of people paid to notice things."
  },

  "bandit_armory_trail": {
    img: "room_bandit_armory_trail",
    detail: `The armoury is a converted farmhouse outbuilding, its original purpose visible in the stone construction and the ventilation holes near the ceiling now repurposed for arrow slits. Inside, weapons rack against every wall — some purchased, some confiscated, some stolen in ways the seller would dispute.

The enforcer who guards the passage to the inner sanctum is the largest person you have seen in the trail's stretch. He is not large in the theatrical way of dungeon bosses — he is large in the way of someone who has done physical work for many years and has the wrong relationship with conflict. He is also, notably, standing between you and the door to the north.

The confiscated weapons include things that belonged to travelers who came this way with bad timing.`,
    atmosphere: "Metal and oil and organized threat. The enforcer breathes loudly. This is the only sound in the room."
  },

  "bandit_vault_trail": {
    img: "room_bandit_vault_trail",
    detail: `The plunder vault is a cave — natural, found rather than built, its entrance worked into the hideout's layout because location is everything in banditry as in real estate. Inside: stacked crates, coin sacks on a shelf, a locked chest in the far corner, and a collection of confiscated goods sorted by type with a neatness that reflects the Road Captain's standards.

A manifest is pinned to a post by the entrance — a running inventory of what comes in and what goes out. The handwriting is precise. The accounting is accurate. The Road Captain knows what he has to the coin and the item. This level of organization is what has kept him operational while other bandit networks on the trail collapsed.

The guard on duty is reading. This is not the relaxed reading of someone off-duty; it is the practiced waiting of someone who has done this many times.`,
    atmosphere: "Cave cold, which is different from outdoor cold. The smell of damp stone, old cloth, and money."
  },

  "bandit_captain_den": {
    img: "room_bandit_captain_den",
    detail: `The Road Captain's personal chamber is the most official-looking space in the hideout — a desk, a map, a chair of some quality, wanted posters on every wall. Some of the posters feature him. He has annotated them with corrections to the physical descriptions.

The map is detailed in a way that implies surveillance rather than guesswork. Every inn, waypost, and patrol pattern between the two towns is documented. At the center of the map, the King's Road itself is drawn in red, and in the margins, income projections in the same precise hand as the vault manifest.

A stolen ledger sits on the desk. It is not the Captain's ledger — the binding is wrong, the initials on the clasp are not his, and he has not opened it. He took it because someone was carrying it and seemed nervous about losing it, and the Captain considers nervous cargo worth acquiring.`,
    atmosphere: "A professional's space. Order imposed on a cave. The wanted posters give the room an unintentional portrait gallery quality."
  },

  // ── Branch 5: Farmstead Ruins ─────────────────────────────────────────────
  "farmstead_gate": {
    img: "room_farmstead_gate",
    detail: `The farmstead gate is cast iron, built for permanence, now rusted open at an angle that suggests the hinges failed rather than anyone made a choice to leave it open. The farm track beyond it is overgrown to knee height. The fields on either side of the track are what happens to cultivated land when cultivation stops — the crops died, the weeds moved in, and the weeds started their own succession.

Shades drift between the old fence posts. They are the spirits of farmhands, field workers, people whose lives were lived in the pattern of seasons and who do not know what to do with a pattern that has stopped. They are not aggressive by nature. They are disoriented, and disorientation expresses itself in territorial behavior.

Villagers from Ashford do not come here. When asked, they change the subject.`,
    atmosphere: "Abandonment has a particular smell — wet vegetation reclaiming dry spaces, old wood softening back into earth."
  },

  "farmstead_yard": {
    img: "room_farmstead_yard",
    detail: `The main yard of the farmstead is still organized, after a fashion. The shapes of the buildings — collapsed barn to the west, silo to the east, farmhouse foundation ahead — define the space the way ruins define spaces, as memory of function rather than function itself.

Something has animated the agricultural equipment. The ploughs and rakes move with purposeful incompetence, following work patterns they were spelled into at some point, now running on whatever animating energy remains when the original purpose is gone. A plough is currently working an area of rubble with methodical thoroughness. It will not find what it is looking for.

The shades here are more numerous and more agitated than at the gate. The yard was where the household gathered. The household is not here. The shades have not processed this.`,
    atmosphere: "The sound of the animated equipment is jarringly domestic. Everything else here is ruin."
  },

  "farmstead_silo": {
    img: "room_farmstead_silo",
    detail: `The grain silo was the farmstead's pride — round, stone-built, with a conical cap that still mostly holds. Inside, decades of accumulated moisture has turned the remaining grain to a dark matter coating the lower walls. The smell is profound.

Silo rats — the large kind that develop when food security removes natural pressure — have colonized the upper levels. They are not aggressive so much as territorial with the casual confidence of things that have had no predators. Cave toads arrived later, having followed the rats, and now occupy the lower level in a damp, toxic-skinned mass.

A wooden ladder leads to the upper level. The chest at the top is locked with a mechanism someone installed deliberately, in a grain silo, which implies the contents were worth the effort.`,
    atmosphere: "The smell of old grain and wet stone. The rats in the upper level are aware of you. The toads do not react to anything."
  },


  // ── Frostheim Trail ───────────────────────────────────────────────────────

  "north_gate": {
    img: "room_north_gate",
    detail: `The North Gate of Shadowmere is less ceremonial than the South. Where the South Gate faces the Ashwood Forest with ruined iron doors and the weight of history, the North Gate is simply where the road stops being cobblestone and becomes packed dirt and then, further on, stone.

A notice board here has one posting: a rough map showing the trail north to the mountain settlements, with a warning about conditions above the snowline. The warning was written three years ago and has weathered to near-illegibility, which may or may not be informative.

The road north climbs immediately. Within two hundred meters the buildings of Shadowmere are below you and the hills are above.`,
    atmosphere: "Cold comes from the north, even in summer. The gate posts are carved with old warding marks."
  },

  "mountain_foothills": {
    img: "room_mountain_foothills",
    detail: `The foothills are the first honest indication that the mountain north of Shadowmere is serious. The road — still road at this point, not yet a trail — climbs in long switchbacks through scrub and thin woodland. The trees are shorter here than in the Ashwood, shaped by wind into persistent leans toward the south.

The first patches of snow appear in the north-facing hollows — not deep, not threatening, but present. A reminder. In winter these hollows are the first to fill and the last to clear.

From the ridge above, on a clear day, you can see the dark shape of the Frostheim watchtower above the treeline. It is further than it looks.`,
    atmosphere: "The wind is from the north and carries a bite. The smell of snow over rock and thin soil."
  },

  "mountain_lookout": {
    img: "room_mountain_lookout",
    detail: `A natural rock shelf juts from the hillside, giving a clear view south over the full spread of the Shadowmere valley — the town visible below as a cluster of amber lights, the Ashwood a dark mass to the south, the dungeon entrance a black rectangle at the edge of the gate.

The shelf has been used as a resting point for generations of travellers making the mountain road. There are old fire rings, carved initials, a rusted iron hook in the rock face that once held a lantern. The view is the same as it has always been. Everything below has changed.

On the eastern horizon, the sky tends to a deeper blue than elsewhere — the beginning of the range that runs east for forty leagues without a pass.`,
    atmosphere: "Wind-exposed and cold. The view south is extraordinary. The way back looks easy from up here."
  },

  "frost_trail_1": {
    img: "room_frost_trail",
    detail: `The road gives up pretending at the first serious ridge and becomes a trail. The surface changes from packed earth to bare rock worn smooth by a thousand years of boot leather, then to loose stone that requires some attention.

The trees thin here and the shape of the landscape changes — everything is rock and sky and the sound of wind. The cold is no longer a suggestion. A cairn of stones at the trail fork has been added to by travellers for decades, each one leaving a stone as a custom of passage. The pile is impressively large.

The mountains ahead are white from the midpoint upward.`,
    atmosphere: "The wind is louder here, finding channels between the ridges. The cold is constant and purposeful."
  },

  "frost_trail_2": {
    img: "room_frost_trail_2",
    detail: `The switchbacks here are deliberate engineering — someone with experience built this section of path. The turns are tight, each one revealing another wall of rock above and a longer drop below. Snow covers the path from here on, compacted to ice in the most-used sections, softer in the shade.

Ice Wolf tracks cross the path multiple times. Old ones are partially filled with windblown snow. Some are not old.

Above the next ridge the trail levels briefly into an exposed traverse before the final climb to the pass. The view here, when the cloud clears, is the full northern face of the range — grey and white and permanently cold.`,
    atmosphere: "The sound of wind through rock. The ice on the path requires care. Your breath fogs."
  },

  "glacier_cave": {
    img: "room_glacier_cave",
    detail: `A cave carved by glacial movement over ten thousand years, its walls translucent blue-green ice that glows faintly with stored light from seasons of exposure before it was buried. The cold here is absolute and different in character from the cold outside — still, dense, the cold of something that has been very cold for a very long time.

Ancient things are visible in the ice walls — the shapes of animals, a tree trunk, at one point what appears to be a sword. They are too deep to reach. The glacier has been here longer than whatever put them there.

The golem that guards this place did not come from outside. It formed here.`,
    atmosphere: "Glacial blue light, completely still air, a cold that doesn't fluctuate. Silence except for very distant settling sounds deep in the ice."
  },

  "frost_trail_3": {
    img: "room_frost_trail_3",
    detail: `The High Pass is the point where casual travellers turn back. The path narrows to two people wide, stone walls on both sides channelling the wind into a constant horizontal pressure. Snow collects in drifts against the east wall while the west face is scoured clean.

Someone has strung a rope along the most exposed section, anchored with iron spikes driven into the rock. The rope is old and frayed in places but still functional. Travellers grip it without shame.

The summit of the pass is marked by a second cairn, larger than the one below, with a carved stone at its base that reads in Norse: THOSE WHO PASS ARE COUNTED AMONG THE WORTHY. The translation was added in common script by a later traveller with a better grasp of diplomacy.`,
    atmosphere: "Wind loud enough to require raised voices. The cold is absolute. Nothing grows here."
  },

  "ice_pass": {
    img: "room_ice_pass",
    detail: `The Ice Pass is a narrow corridor between two cliff faces where meltwater runs and re-freezes in seasonal cycles until the rock itself is coated in clear ice six inches deep. Walking it requires short steps and patience. Falling is theoretically survivable. Practically, it depends on the season.

The ice is not entirely natural. Someone carved footholds at the worst sections — shallow cuts filled with ice but still usable if you know to look for them. The cuts are centuries old. Whoever made them was both practical and patient.

At the end of the pass the cliffs open and the plateau above is visible — and on clear days, the smoke from the Frostheim mead hall, rising straight in the still mountain air.`,
    atmosphere: "Ice underfoot, ice overhead where the cliffs lean in. Every sound echoes cleanly. The footing requires attention."
  },

  "storm_ridge": {
    img: "room_storm_ridge",
    detail: `The final exposed ridge before the plateau. The name is earned — storms build here first and clear here last, and on bad days the ridge is impassable without equipment and experience. On good days it is merely demanding.

The view from the ridge is the reward. North: the plateau and the clustered structures of Frostheim, smoke rising, longship masts visible at the frozen dock. South: the full sweep of everything you came through — trail, foothills, valley, Shadowmere. The world below looks manageable from here.

A stone shelter has been built at the ridge midpoint — barely large enough for four people, no door, enough to block the wind. It has been used regularly for a long time. There are names scratched in every internal surface.`,
    atmosphere: "The wind is intermittent here — calm, then a gust that requires bracing. The cold rewards you by making the view exceptional."
  },

  "frostheim_approach": {
    img: "room_frostheim_approach",
    detail: `The plateau opens here and the trail becomes a proper road again — stone-paved in the Norse fashion, wide enough for a cart, with drainage channels cut into the sides. Frostheim is visible ahead: a cluster of heavy timber and stone buildings built low against the weather, smoke from multiple hearths, the great hall's roof the largest structure.

The Frostheim gate is manned. A guard in heavy Norse plate watches your approach with professional disinterest. He has seen the look of the south on travellers before. It does not impress him.

The smell of the settlement reaches you before the sounds do: woodsmoke, forge heat, the yeasty warmth of the mead hall. After the trail, it is extraordinarily welcoming.`,
    atmosphere: "The wind drops at the plateau edge. The cold is still present but still. Warmth ahead — actual, specific warmth."
  },

  "frostheim_square": {
    img: "room_frostheim_square",
    detail: `The Thing — the Norse name for the gathering place — is a broad square of flat stone surrounded by the settlement's main structures. A carved wooden post stands at the centre, hung with shields of past jarls and carved with a record of the settlement's history in runic script that takes a trained reader the better part of an hour to work through.

The square functions as marketplace, court, and social ground. In the mornings traders set up near the eastern buildings. In the evenings the benches around the post fill with people eating and arguing. On significant days the whole settlement gathers here and the jarl speaks from the post.

The people of Frostheim are large, deliberate, and visibly competent in ways that Shadowmere's citizens are not. They assess strangers efficiently and without malice.`,
    atmosphere: "Open sky, cold air, the sounds of the settlement on all sides. The carved post watches everything."
  },

  "mead_hall": {
    img: "room_mead_hall",
    detail: `Jarl Bjorn's great hall is the largest structure in Frostheim and the oldest, rebuilt three times on the same foundation after fires and a storm collapse. The current hall is the most solid version — stone base to the height of a man, heavy timber above, a turf roof that has been growing for forty years.

Inside: two long tables running the length of the hall, a fire trench down the centre, trophies on the walls — wolf heads, golem fragments, the skull of something large that nobody will identify specifically. Bjorn sits at the high table with the quality of a man who has sat there long enough that it has become part of his posture.

At the far end of the left table, Gunnar Ironside — the hall's self-appointed Hnefatafl champion — has a carved board set out and a horn that never seems to empty. He has beaten everyone in Frostheim. He is now working through visitors.

The mead here is Frostheim's own. It is better than anything available south of the mountains, and the hall is aware of this.`,
    atmosphere: "Warm, loud, fire-lit. The smell of mead, woodsmoke, roasted meat. The sounds of people who are comfortable with each other."
  },

  "hnefatafl_hall": {
    img: "room_hnefatafl_hall",
    detail: `A side chamber off the great hall, quieter and more deliberately arranged. Leif Erikssen — called Leif the Unbeaten, though he disputes the dramatic quality of the name — sits at a carved wooden table with a Hnefatafl board set up and waiting.

The board is old. The pieces are old. Leif is somewhere between forty and sixty and has the particular stillness of someone whose primary occupation is thinking several moves ahead. He plays Hnefatafl the way some people breathe — continuously, automatically, and better than everyone around him.

The walls are hung with carved boards of various sizes. All his. All marked with the dates and outcomes of notable games. He has never marked a loss because none have occurred.`,
    atmosphere: "Quiet. Focused. The fire from the main hall reaches here as warmth and light. Leif's attention is entirely on the board."
  },

  "frostheim_market": {
    img: "room_frostheim_market",
    detail: `The eastern building serves as the settlement's combined market and trading post. Freya Stonehand — a broad-shouldered woman with grey-streaked braids and the business manner of someone who has been negotiating with difficult people her entire life — manages the stock from behind a heavy counter.

The goods here are practical: cold-weather supplies, preserved food, tools, potions sourced from Völva's workroom. There is no luxury trade in Frostheim. Everything sold here serves a purpose in a cold climate where everything that breaks or runs out is genuinely dangerous.

Freya prices things fairly and argues with no one. If she says a price, that is the price. Attempts to negotiate are met with a silence that communicates this effectively.`,
    atmosphere: "Practical, ordered, warm from a small iron stove in the corner. The smell of preserved food and wool."
  },

  "frostheim_smith": {
    img: "room_frostheim_smith",
    detail: `Sigrid's forge is the loudest building in Frostheim and the warmest by a significant margin. Sigrid herself is a compact, scarred woman in her mid-forties who has been working iron since she was old enough to hold a hammer, which was younger than most people consider appropriate.

The weapons and armor on display are better than anything available south of the mountains. The metallurgy is Norse tradition combined with adaptations for cold-climate use — thicker stock, different heat treatment, materials sourced from the glacier and the volcanic vents below the east ridge.

She works while you browse. She does not pause to greet you. The quality of the work greets you instead.`,
    atmosphere: "Forge heat significant enough to be physically pressing. The smell of hot iron and coal. The rhythm of hammer work."
  },

  "frostheim_armory": {
    img: "room_frostheim_armory",
    detail: `The armory occupies the building east of the forge and operates on the principle that some weapons are too serious for the general market. The pieces here are not for adventurers who are new to their profession.

The Berserker Blade requires a commitment to a particular fighting philosophy. The Thunder Maul requires, at minimum, the ability to lift it. The Frost Plate is heavy enough that wearing it for the first time tends to produce a specific expression of reassessment.

The armory keeps no attendant. The items speak for themselves. Payment is left in the iron chest by the door on the honor system — a system enforced by the knowledge that Sigrid's forge is next door and she is always working.`,
    atmosphere: "Quiet. Cold despite its proximity to the forge. The weapons on the walls have a weight to them beyond the physical."
  },

  "rune_temple": {
    img: "room_rune_temple",
    detail: `The Temple of the Norns is older than Frostheim's current settlement — older, possibly, than any of the structures in Shadowmere. The stone walls are pre-Viking, built by people whose relationship to this mountain predates the Norse arrival by centuries.

Völva tends it. She arrived in Frostheim seventeen years ago from the east, accepted no explanation of herself, and proceeded to occupy the temple as though she had always been there. The settlement accepted this. The temple has been quieter and more functional since.

The interior is carved runes on every surface, three fires that burn without fuel, and a scrying pool that shows, variably, useful information or disturbing things, depending on what you need to know.`,
    atmosphere: "Stone cold that is different from mountain cold — older, deliberate. The three fires make no sound. The runes are warm to the touch."
  },

  "frozen_docks": {
    img: "room_frozen_docks",
    detail: `The lake behind the temple has been frozen for eight months of the year for as long as anyone in Frostheim can remember. In the four months it isn't, the longships go south through the pass river and on to wherever the Frostheim traders go — which is their business.

Currently three longships are locked in the ice, their hulls wrapped in sealskin for winter protection, their prows pointing at the far shore. The carved dragon heads have been removed and stored — a Norse tradition, to avoid frightening the land spirits of a home port.

Standing on the frozen lake at night, with the settlement lights behind you and the mountains on three sides, is one of the more extraordinary experiences available in this part of the world.`,
    atmosphere: "Absolute stillness over the ice. Sound travels strangely here. The cold is complete and somehow peaceful."
  },

  "farmstead_cellar": {
    img: "room_farmstead_cellar",
    detail: `The farmhouse collapsed inward but the cellar survived intact — stone arches, stone floor, stone walls, stone-cold air that has not exchanged with the outside since the farmhouse came down. The entrance is through a slanted door in the rubble that was not visible until you looked.

Wine racks line the east wall, half the bottles still present. Root barrels along the south wall contain something desiccated that may have been vegetables once. The original owner arranged this space with care — it was a good cellar, provisioned seriously, by someone who intended to come back down here many times.

The farmstead wraith is that owner. It has been in this cellar since the farmhouse burned. It does not know the farmhouse burned. It is waiting for people to come down for dinner, and the discrepancy between what it expects and what arrives has given its grief somewhere very specific to go.`,
    atmosphere: "Cellar cold — still and total. Wine smell from the surviving bottles. The wraith's presence displaces the air in a way that torches feel."
  },

  // ── Ironveil Mines ────────────────────────────────────────────────────────

  "west_road": {
    img: "room_west_road",
    detail: `The road west of the temple was originally a trade route for ore carts rolling in from the mines. The cobblestones end at the edge of the temple district and become packed earth worn into deep ruts by generations of iron-laden wheels. The ruts are still there. The carts have not been through recently.

Scrub oak closes in from both sides as the road climbs. The hills ahead show bare limestone — cracked, quarried, and in places simply collapsed. On a clear day you can see the dark mouth of the mine complex from here, a black rectangle cut into the hillside like a wound that never healed.

A weathered signpost leans at the crossroads: IRONVEIL MINES — 2 LEAGUES.`,
    atmosphere: "The smell of dust and dry stone. Wind from the hills carries the faint metallic ring of work being done somewhere deeper in."
  },

  "mine_trail_1": {
    img: "room_mine_trail",
    detail: `The mine road narrows as it climbs. Quartz veins catch the sunlight in the limestone bluffs to the north — the old open quarry that preceded the underground works. Someone tried to get the surface ore first, ran out of accessible material, and went down instead. The quarry is abandoned now.

The ground underfoot is layered with decades of mine dust — grey-brown, fine, coating everything. Boot prints in the dust go in both directions. Some of them are recent. Not all of them are human.

A battered sign has been nailed to a stone: IRONVEIL MINES — PROCEED WITH CAUTION. Beneath that, in fresher chalk: AND BRING A LIGHT.`,
    atmosphere: "The wind is less here. The silence between gusts has the particular quality of space being watched."
  },

  "mine_trail_2": {
    img: "room_mine_descent",
    detail: `The road drops into a narrow ravine as the hills close around it. Limestone walls rise fifteen meters on both sides, layered in rust-orange and ash-grey in the strata of different ages. Old support timbers are bolted into the cliff face at intervals — someone spent money making this approach safe, which implies the mine once made enough to justify the expense.

The timbers are dry now, cracked, in places pulling loose from their anchors. The support infrastructure is cosmetic at this point. What it supports is mostly itself.

The cave entrance is visible ahead: a rough arch cut into solid rock, the timbers framing it still intact, cold air flowing outward with the patience of something that has been breathing a long time.`,
    atmosphere: "The ravine channels wind into a low, continuous moan. Cold mineral air pushes against you from the cave ahead."
  },

  "quarry_outlook": {
    img: "room_quarry_outlook",
    detail: `A ledge of crumbling limestone overlooks the open-air quarry — the precursor to the underground mines, worked dry two generations ago and abandoned with the equipment still in it. Rusted iron tools lie half-buried in decades of windblown soil. A crane arm tilts at an angle that suggests the cable gave way at a moment nobody was ready for.

From up here you can see the full extent of the mine complex cut into the hillside to the west: three visible tunnel mouths, a collapsed section in the middle, and at least one entrance that appears to have been reopened recently by someone other than the original mining company.

Something in the quarry below is moving. Rocks. Rocks that should not be moving.`,
    atmosphere: "High, exposed. The wind is strong here and carries grit. The view is worth it. The movement in the quarry below is not reassuring."
  },

  "mine_entrance": {
    img: "room_mine_entrance",
    detail: `The entrance to Ironveil Mines is a rough arch cut through solid limestone, framed by timber supports that have aged to iron-grey. A lantern on an iron hook burns steadily — someone refills it, which means someone still comes here regularly.

Old Varn operates from a supply post built into the left wall: a rough timber counter, shelves of pickaxes and lamp oil, a stool he rarely gets off. He has the look of someone who once went into mines himself and has been very careful about that since. The scar running from his left cheekbone to his jaw is the shape of a pickaxe head. He will not explain it.

Tunnels branch in three directions: north to the copper veins, south to the coal shaft, and west into the iron heart of the mountain. Varn sells pickaxes. He insists you need one. He is correct.`,
    atmosphere: "The cold from the tunnels is constant and particular — still air that has been underground a long time. The lantern flame bends inward, always inward."
  },

  "copper_mine": {
    img: "room_copper_mine",
    detail: `The copper vein tunnel is wide enough to work comfortably — whoever designed this section of the mine knew what they were doing. Green-tinged streaks run through the buff limestone walls in bold, clear lines. The ore is close to the surface here, accessible, easy to chip free with a decent pickaxe.

A rusted mining cart sits half-full on old iron rails that run back toward the entrance. The ore in the cart has been sitting long enough to oxidize fully — green as old coins, crusted over. Whoever filled this cart never came back to push it out.

The air tastes of copper and old candle wax. The walls ring when struck.`,
    atmosphere: "Metallic, cool, dry. The ring of a pickaxe echoes further than it should."
  },

  "coal_tunnel": {
    img: "room_coal_tunnel",
    detail: `The coal shaft is black. Entirely, completely black — the seams are so thick and close to the surface that the walls, floor, and ceiling are all coal face. The lantern light does not reflect here. It simply illuminates a circle of absolute darkness and stops.

The air is warmer than the rest of the mine. Old fire smell — ancient combustion, carbon laid down in a geological era that predates anything currently living on the surface. The coal under your boots crumbles to dust with each step, releasing a smell that is both mineral and organic at once.

Someone has been mining here recently. Fresh chisel marks on the south wall. The coal dust on the floor is disturbed in a way that suggests the someone had multiple legs.`,
    atmosphere: "Warm, completely dark without light, the smell of ancient organic carbon. Sounds travel strangely in solid coal."
  },

  "iron_vein": {
    img: "room_iron_vein",
    detail: `The main tunnel opens into a wide natural chamber that someone enlarged over many years of work. Iron ore veins run through the walls in dense rust-red bands, glowing warm in torchlight like the rock itself is feverish. The floor is littered with old tailings — waste rock from previous mining operations, broken down and spread.

The geological process that created this seam was violent. You can see it in the structure of the rock — layers compressed, folded, forced together by pressures that operated on timescales that make human history look like an afternoon. Whatever iron is here came from somewhere very deep and very far away, geologically speaking.

The nest in the northeast corner was not part of the original mine design.`,
    atmosphere: "The iron ore gives the air a faint metallic warmth. Deep underground quiet. The sort of silence that has mass."
  },

  "silver_lode": {
    img: "room_silver_lode",
    detail: `The deepest section of the mine was sealed behind a roof collapse that filled the connecting tunnel. Someone re-opened it. The excavation is recent — the broken stone still smells of fresh-cut rock, and the timber props are new wood, not aged grey like the rest of the mine.

The silver threads in the walls are extraordinary. Dense enough that in places they look woven rather than geological — silver veining through black rock in patterns too regular to be accidental and too extensive to be anything else. The ore here is the richest in the mine by a factor that the original miners either missed entirely or discovered and kept very quiet about.

The air is completely still. No draft from anywhere. Whatever lives in this chamber has been here long enough that its presence is simply part of the atmosphere.`,
    atmosphere: "Absolute stillness. The silver in the walls catches torchlight and fractures it into cold points. You are not alone here."
  }

};

// ── Level-scaled limits ───────────────────────────────────────────────────
function maxCompanions(p){
  // 1 companion base, +1 per 10 levels
  return 1 + Math.floor((p.level||1) / 10);
}
function maxZombies(p){
  // 1 zombie base, +1 per 10 levels
  return 1 + Math.floor((p.level||1) / 10);
}
function companionSlotInfo(p){
  const max=maxCompanions(p);
  const cur=(p.companions||[p.companion].filter(Boolean)).length;
  return {max, cur};
}


// ── Item profiles (image + description for LOOK [item]) ──────────────────
const ITEM_PROFILES = {
  // ── Weapons ──────────────────────────────────────────────────────────────
  "rusty sword":        {img:"rusty_sword",      desc:"A blade kept together more by habit than metallurgy. Nicked, pitted, and embarrassing — but it still cuts."},
  "iron sword":         {img:"iron_sword",        desc:"Standard military issue. Reliable, balanced, nothing fancy. The sword that has won more fights than any legendary blade simply by being present."},
  "battle axe":        {img:"battle_axe",         desc:"Heavy enough that swinging it is a commitment. Favored by those who prefer ending a fight quickly over fighting gracefully."},
  "knight\'s sword":  {img:"knights_sword",      desc:"Forged for a knight who never came back. The balance is exceptional. Someone put real craft into this blade."},
  "shadow blade":      {img:"shadow_blade",        desc:"Seems to absorb the light around it rather than reflect it. Cuts with an unsettling silence."},
  "envenomed dagger":  {img:"envenomed_dagger",    desc:"The groove along the blade is no accident. Whatever fills it isn\'t meant to be washed off."},
  "warrior\'s blade": {img:"warriors_blade",      desc:"Forged from iron, obsidian, and the bones of those who underestimated its maker. The edge holds longer than it should."},
  "venomsteel dagger": {img:"venomsteel_dagger",   desc:"The steel itself carries poison now — the metal and venom have become one thing. Cuts that don\'t kill still linger."},
  "void blade":        {img:"void_blade",           desc:"The void crystal at its core makes the blade flicker between here and somewhere else. Strikes hit twice — once in this world, once in whatever is adjacent to it."},
  "frost blade":       {img:"frost_blade",          desc:"Taken from a Frost Knight. Permanently cold. Wounds from this blade don\'t bleed — they freeze."},
  "silver sword":      {img:"silver_sword",         desc:"Githyanki-forged silver that never dulls. Too light to feel real. Hits harder than physics should allow."},
  "cursed blade":      {img:"cursed_blade",          desc:"Every previous owner died holding it. This is noted on the blade itself, in a script no living scholar can read."},
  "bone staff":        {img:"bone_staff",            desc:"Built from dungeon bones bound with dark runes. Channels necromantic energy as naturally as a river channels water."},
  "ranger\'s bow":    {img:"rangers_bow",           desc:"Found in an abandoned camp. The owner knew what they were doing — the grip is worn smooth from years of use."},
  "bandit king\'s blade":{img:"bandit_kings_blade", desc:"Stolen finery meets brutal practicality. The gold inlay is just for show. The edge is not."},
  "arcane tome":       {img:"arcane_tome",           desc:"The knowledge inside rewires the reader. Not metaphorically. You feel different after reading it — faster, sharper. ATK increases permanently."},

  // ── Armor ─────────────────────────────────────────────────────────────────
  "leather armor":     {img:"leather_armor",    desc:"Cured, treated, and fitted. Won\'t stop a determined blade but makes you feel better about trying."},
  "chain mail":        {img:"chain_mail",        desc:"Rings of iron linked in patterns worked out over centuries of people trying not to die. Heavier than it looks."},
  "plate armor":       {img:"plate_armor",       desc:"Full plate. You could survive a horse falling on you. Moving quietly is no longer a realistic option."},
  "iron shield":       {img:"iron_shield",       desc:"Dented from previous use. The dents are reassuring — they mean the shield did its job."},
  "forest cloak":      {img:"forest_cloak",      desc:"Woven from materials that seem to shift color depending on what\'s behind you. Practical and faintly unsettling to look at directly."},
  "void cloak":        {img:"void_cloak",         desc:"The fabric seems to exist in two places at once. Wearing it gives the impression of being slightly elsewhere."},
  "shadow cloak":      {img:"shadow_cloak",       desc:"Not just dark — shadow itself, woven tight. Whatever this was made from is not strictly material."},
  "dragon scale mail": {img:"dragon_scale_mail",  desc:"Each scale shed by a living dragon, layered and bound. The scales still hold heat from the dragon that wore them first."},
  "troll hide armor":  {img:"troll_hide_armor",   desc:"Troll hide that regenerated once after being cut, then was harvested before it could do so again. Tough enough to make an impression."},
  "cultist robe":      {img:"cultist_robe",        desc:"Dark cloth stitched with runes in a language that predates the dungeon. Wearing it feels like being watched from inside."},

  // ── Trinkets ──────────────────────────────────────────────────────────────
  "silver ring":       {img:"silver_ring",        desc:"A plain silver band. Something was engraved on the inside but worn smooth with time. Still carries a quiet protection."},
  "enchanted gem":     {img:"enchanted_gem",       desc:"A gem that hums at a frequency you feel in your teeth. The enchantment inside is old and doesn\'t fully translate."},

  // ── Bags ─────────────────────────────────────────────────────────────────
  "worn satchel":      {img:"worn_satchel",        desc:"Battered leather, fraying strap, buckle that sticks. Holds 6 items. Gets the job done."},
  "leather satchel":   {img:"leather_satchel",     desc:"Well-made and sturdy. Holds 10 items without complaint. The sort of bag you pass down to someone."},
  "traveller bag":     {img:"traveller_bag",        desc:"Built for someone who planned to go far. Multiple compartments, reinforced base. Holds 12 items."},
  "merchant sack":     {img:"merchant_sack",        desc:"Heavy canvas, brass rings, a lock hasp that actually works. Holds 15 items. Built for moving stock, not subtlety."},
  "magic satchel":     {img:"magic_satchel",        desc:"The inside is demonstrably larger than the outside. Physics has filed a complaint. Holds 20 items."},

  // ── Potions ───────────────────────────────────────────────────────────────
  "healing potion":    {img:"healing_potion",       desc:"Tastes terrible. Works immediately. Mira\'s own blend — the exact recipe is hers alone."},
  "greater heal":      {img:"greater_heal",          desc:"A concentrated restoration draught. The color suggests it should not be consumed by anything living. It helps regardless."},
  "full restore":      {img:"full_restore",           desc:"Complete cellular restoration in a glass bottle. Whatever wounds you arrived with, you won\'t leave with them."},
  "antidote":          {img:"antidote",              desc:"Bitter, fast, effective. Neutralizes most poisons and curses encountered below the waterline."},
  "strength tonic":    {img:"strength_tonic",        desc:"Permanently enhances muscle fiber and reaction speed. The enhancement does not reverse. ATK +3 forever."},
  "iron skin draught": {img:"iron_skin_draught",     desc:"Literally thickens the outer layers of your dermis. Permanent. Slightly uncomfortable for the first few days. DEF +2 forever."},
  "elixir of power":   {img:"elixir_of_power",       desc:"The Shadow Broker\'s most prized stock. What it does to the body to produce ATK +8 permanently is not discussed in polite company."},
  "elixir of stone":   {img:"elixir_of_stone",       desc:"Derived from golem essence. The skin does not turn to stone but it might as well. DEF +8 permanently."},
  "beast treat":       {img:"beast_treat",            desc:"Pip\'s own recipe. Smells extraordinary to animals. Has a non-zero success rate at making apex predators decide you are acceptable company."},

  // ── Crafting materials ────────────────────────────────────────────────────
  "obsidian shard":    {img:"obsidian_shard",        desc:"Volcanic glass with an edge that makes steel look lazy. Used in the finest blades and the darkest rituals."},
  "bone shard":        {img:"bone_shard",             desc:"A fragment of dungeon bone. Old enough that it\'s more mineral than organic. Useful in dark crafting."},
  "void crystal":      {img:"void_crystal",           desc:"A crystal that formed in a place where matter got confused about its obligations. Cold to the touch. Always."},
  "shadow essence":    {img:"shadow_essence",         desc:"Condensed darkness. Not metaphorical. This is actual shadow, made dense enough to hold."},
  "serpent fang":      {img:"serpent_fang",            desc:"Still carries trace venom. Handle with care. Useful in poison-based crafting and as a general threat."},
  "dragon scale":      {img:"dragon_scale",            desc:"Shed by the young dragon, or removed the hard way. Heat-resistant enough to make excellent armor material."},
  "troll hide":        {img:"troll_hide",              desc:"Troll hide regenerates once. This piece was harvested at the right moment. Extraordinarily tough."},
  "ancient rune":      {img:"ancient_rune",            desc:"Stone carved with symbols that predate the language they vaguely resemble. Still active. Something is stored inside."},
  "grave dust":        {img:"grave_dust",              desc:"Dust from the oldest graves. Carries residual death energy that necromancers find professionally useful."},
  "swamp herb":        {img:"swamp_herb",              desc:"Bitter, medicinal, and extremely difficult to find outside of a swamp. Heals 8 HP or combines into stronger draughts."},

  // ── Mining tools & ores ──────────────────────────────────────────────────
  "iron pickaxe":  {img:"iron_pickaxe",  desc:"A sturdy pickaxe with an iron head and hickory handle. Equip it as a weapon to mine — gives +5 ATK and survives 10 strikes before the head dulls."},
  "steel pickaxe": {img:"steel_pickaxe", desc:"A well-balanced steel pickaxe with a tempered head. Equip as a weapon to mine — +5 ATK and lasts 20 strikes before dulling."},
  "copper ore":    {img:"copper_ore",    desc:"A chunk of greenish copper ore stripped from the mine wall. Sellable to Varn or smelted into something useful."},
  "coal":          {img:"coal",          desc:"A dense black lump of coal. Burns hot and long. Used as fuel when smelting ore into ingots at The Crucible."},
  "iron ore":      {img:"iron_ore",      desc:"Raw iron ore with a dark reddish tint. Heavier than it looks. Smelt two pieces with coal for a usable iron ingot."},
  "silver ore":    {img:"silver_ore",    desc:"A chunk of gleaming silver ore pulled from the deepest vein. Rare and valuable. Varn pays top price for these."},
  "iron ingot":    {img:"iron_ingot",    desc:"Smelted iron, cooled into a dense bar. Torvar's preferred base material for advanced smithing work."},
  "spider silk":   {img:"spider_silk",   desc:"Thick, glistening strands of cave spider silk. Unpleasant to harvest. Used in certain armoring and crafting recipes."},
  "cave moss":     {img:"cave_moss",     desc:"A grey-green cave moss, faintly luminescent in total darkness. Mira would know exactly what to brew from it."},
  "iron shard":    {img:"iron_shard",    desc:"A jagged fragment torn from an iron golem. Dense and sharp, with traces of the enchantment that animated it."},
  // ── Frostheim materials & gear ────────────────────────────────────────────
  "frost pelt":      {img:"frost_pelt",      desc:"A thick winter pelt from an Ice Wolf, still cold to the touch. Excellent insulation for armour lining."},
  "ice shard":       {img:"ice_shard",       desc:"A fragment of ancient glacial ice that never melts, no matter the temperature. Used in cold-forged weapons and certain alchemical processes."},
  "giant bone":      {img:"giant_bone",      desc:"A bone from a Frost Giant — twice as long as a normal man and dense as iron. The marrow is frozen solid."},
  "mead":            {img:"mead",            desc:"A horn of Frostheim mead — strong enough to keep the cold out, strong enough to let something else in. Heals 10 HP."},
  "rune stone":      {img:"rune_stone",      desc:"A flat river stone carved with a single rune by Völva herself. Warm to the touch despite the climate. Purpose unclear but unmistakably significant."},
  "runic axe":       {img:"runic_axe",       desc:"A broad Norse axe with runic script hammered into the blade. Tyr's prayer. Sigrid won't translate it for outsiders."},
  "frost spear":     {img:"frost_spear",     desc:"Eight feet of ash shaft, leaf-shaped iron head, permanently cold. Wounds from this spear don't close quickly."},
  "berserker blade": {img:"berserker_blade", desc:"A two-handed sword for warriors who consider defence an insult. The edge is brutal. The balance is intentionally aggressive."},
  "thunder maul":    {img:"thunder_maul",    desc:"A war maul carrying a fragment of storm giant power. Hitting something with it is less like striking and more like weather."},
  "frost plate":     {img:"frost_plate",     desc:"Cold iron plate over insulating wool and hide. Heavier than southern plate but considerably warmer and equally hard to penetrate."},
  "runewood shield": {img:"runewood_shield", desc:"A round shield of iron-banded runewood with runes on the face. The wood grew above the snowline for two centuries."},
  "norse chain":     {img:"norse_chain",     desc:"Riveted iron rings in the Norse tradition, worn over thick wool. Better cold-weather protection than southern mail."},
  "bearskin cloak":  {img:"bearskin_cloak",  desc:"A full mountain bear cloak, cured and fitted. Warm enough to sleep in the snow. Intimidating enough to prevent some fights entirely."},
  "rock snake":    {img:"rock_snake",    desc:"A flattened, stone-coloured serpent that hunts the rock faces of the mine road. Nearly invisible until it moves."},
  "miner's mail":  {img:"miners_mail",   desc:"Riveted iron plates lined with cave spider silk. Heavier-looking than it actually is. Solid protection for tunnel work."},
  "ore blade":     {img:"ore_blade",     desc:"Forged from pure iron ingot and volcanic obsidian at The Crucible. The edge holds even against stone armour."},
  "silver band":   {img:"silver_band",   desc:"A refined silver ring inlaid with luminescent cave moss resin. The silver carries a faint protective charge."},
  // ── Quest & key items ─────────────────────────────────────────────────────
  "nessa's locket":    {img:"nessas_locket",    desc:"A tarnished silver locket with a pressed flower inside. It belongs to Widow Nessa — taken by the bandits who burned her hamlet."},
  "crude map":         {img:"crude_map",        desc:"Someone who understood Shadowmere drew this. The dungeon is marked. The forest is marked. Several locations are marked with just a skull. That\'s probably fine."},
  "torch":             {img:"torch",             desc:"Simple pitch-soaked wood. Useful when you\'d rather see what\'s coming."},
  "rat tail":          {img:"rat_tail",          desc:"Proof of a kill. Tormund asked for these specifically. He didn\'t elaborate on why he needs the tails and not just a body count."},
  "deepwood root":     {img:"deepwood_root",     desc:"A gnarled root from the deepest part of the swamp. Mira has been trying to get one for months. The alchemical properties are significant — what she\'ll make from it is something special."},
  "iron key":          {img:"iron_key",          desc:"A heavy iron key stamped with crude bandit markings. The lock it fits is somewhere nearby — or was."},
  "gold coin":         {img:"gold_coin",         desc:"A single gold coin. Currency of Shadowmere and everywhere that uses round pieces of stamped metal to represent abstract value."},
  "old coin":          {img:"old_coin",          desc:"Pre-Shadowmere currency. The face stamped on it is unrecognizable. Worth more to collectors than as currency — which is still worth something."},
  "stolen ledger":     {img:"stolen_ledger",     desc:"Vex\'s ledger of unsanctioned transactions. Names, amounts, dates — none of it meant to be seen. Vex wants it back badly."},
  "ancient tome":      {img:"ancient_tome",      desc:"A tome of arcane knowledge too dense to carry as dead weight. Reading it restructures your neural pathways. ATK permanently +4."},
  "forbidden tome":    {img:"forbidden_tome",    desc:"A book locked away for reasons that made sense to whoever locked it. The contents are intelligible. They should not be."},

  // ── Forest & swamp drops ──────────────────────────────────────────────────
  "cave moss":         {img:"cave_moss",         desc:"Thick green moss scraped from cave walls. Faintly luminescent in darkness. Used in poultices and alchemical preparations that require something grown where light doesn\'t reach."},
  "bat wing":          {img:"bat_wing",           desc:"Leathery, dried quickly after removal. Used in certain flight potions and dark enchantments. Smells like a cave."},
  "boar tusk":         {img:"boar_tusk",          desc:"A heavy curved tusk. Used in crafting, carving, and as a general-purpose weapon by people who lost their actual weapon."},
  "spider silk":       {img:"spider_silk",        desc:"Stronger than steel by weight, flexible, slightly sticky. Gem spider silk can hold enchantments as easily as it holds prey."},
  "spider gem":        {img:"spider_gem",         desc:"A faceted gem formed in the abdomen of a gem spider. Contains a trace magical charge. Valuable to jewellers and enchanters alike."},
  "shadow bark":       {img:"shadow_bark",        desc:"Bark from a dark treant — wood that has absorbed so much shadow energy it has become partially non-physical. Useful in shadow enchantments."},
  "nightmare fang":    {img:"nightmare_fang",     desc:"A fang from a Night Horror — a creature that exists partly in dream. The fang remains cold no matter where it\'s kept."},

  // ── Dungeon drops ─────────────────────────────────────────────────────────
  "cursed bone":       {img:"cursed_bone",        desc:"Bone from a creature that died under an active curse. The curse is embedded in the calcium structure. Necromancers pay well for this."},
  "revenant dust":     {img:"revenant_dust",      desc:"What a revenant leaves behind when finally put to rest. The dust carries residue of whatever bound the creature to this world."},
  "ghost essence":     {img:"ghost_essence",      desc:"Spectral residue that solidified after a ghost\'s dissolution. Cold, slightly luminescent, faintly musical if you\'re quiet enough to hear."},
  "spectral dust":     {img:"spectral_dust",      desc:"Fine powder left by a dissolving wraith. Not quite matter. Useful in enchantments that bridge the living and the dead."},
  "void essence":      {img:"void_essence",       desc:"What remains when a void creature is destroyed — the part that existed in this reality, crystallized. Volatile and extremely valuable."},

  // ── Tundra & volcanic drops ───────────────────────────────────────────────
  "yeti fur":          {img:"yeti_fur",           desc:"Dense white fur from a Yeti, still warm despite the creature\'s death. Excellent insulation. Alchemists value it for cold-resistance preparations."},
  "frost pelt":        {img:"frost_pelt",          desc:"Outer hide from a frost wolf. Ice crystals form in the fur permanently — it never warms to room temperature."},
  "ice crystal":       {img:"ice_crystal",         desc:"Crystallized shard of pure cold, formed inside creatures adapted to sub-zero temperatures. Used in frost enchantments."},
  "ice shard":         {img:"ice_shard",            desc:"A needle of magical ice that doesn\'t melt at normal temperatures. Broken from a golem or formed by a particularly cold caster."},
  "ember shard":       {img:"ember_shard",          desc:"A fragment of volcanic material that retains heat indefinitely. Always warm to the touch. Used in fire enchantments."},
  "magma core":        {img:"magma_core",           desc:"The central mass of a lava golem — still molten inside a cooled outer shell. Handle with extreme care. Extremely valuable to enchanters."},
  "wyrm scale":        {img:"wyrm_scale",           desc:"A scale from a rock wyrm, dense as iron and heat-resistant. Larger and rougher than a dragon scale. Still worth using."},

  // ── Sky realm & astral drops ──────────────────────────────────────────────
  "storm feather":     {img:"storm_feather",       desc:"A primary feather from a thunder hawk, permanently charged with static electricity. Handling it makes your hair stand up."},
  "wind shard":        {img:"wind_shard",           desc:"Solidified air current from the sky realm — a paradox that shouldn\'t exist, but does. Enchanters in aerial applications pay premium prices."},
  "cloud essence":     {img:"cloud_essence",        desc:"Condensed cloud matter made tangible. Cold, slightly wet, smells like coming rain. Used in levitation enchantments."},
  "astral essence":    {img:"astral_essence",       desc:"The material signature of an astral creature, crystallized on death. Shimmers between colours that don\'t exist in normal light."},
  "astral fin":        {img:"astral_fin",            desc:"A fin from an astral shark. Cuts through planar barriers as easily as it cuts astral currents. Highly sought by planar researchers."},

  // ── Crystal cavern drops ──────────────────────────────────────────────────
  "diamond core":      {img:"diamond_core",         desc:"The heart of a crystal golem — diamond compressed beyond natural formation. The enchantment that gave the golem life is still faintly active."},
  "prismatic shard":   {img:"prismatic_shard",       desc:"A fragment from a prism titan — each face refracts light into a different magical spectrum. Handle in dim lighting."},

  // ── Currency & misc ───────────────────────────────────────────────────────
  "bandit king's blade":{img:"bandit_kings_blade",  desc:"Stolen finery meets brutal practicality. The gold inlay is just for show. The edge is not."},

  // ── Ashford Village ──────────────────────────────────────────────────────
};

// ── Legendary item lore (full story descriptions) ─────────────────────────
const ITEM_LORE = {
  "aldwyn\'s satchel": {img:"aldwyns_satchel",
    lore:`A brown leather satchel with a brass clasp, monogrammed A.W. on the flap.\n\nAldwyn Whitmore was a traveling merchant who came to Shadowmere three weeks before you did. He was cheerful, loud, and in debt to three separate guilds in three separate cities. None of that explains what happened to him.\n\nTormund won\'t talk about it in detail. He gets quiet when the name comes up — which is the only version of quiet Tormund is capable of.\n\nReturn this to Tormund at the Broken Flagon.`},

  "lich\'s crown": {img:"lichs_crown",
    lore:`An iron crown taken from the Dungeon Lich\'s throne.\n\nThe Dungeon Lich was not always a monster. There are records — fragmented, disputed — of a wizard named Malachar who ruled these lands before the collapse. He sought immortality and found it in the worst way: alive enough to remember being human, dead enough that it no longer matters.\n\nThe crown sat on his skull for two centuries. It radiates dark power and a faint melancholy that you didn\'t expect from headgear.\n\nFather Aldric will weep when he sees this. Wear it if you must. He\'ll understand.`},

  "frost queen\'s crown": {img:"frost_queens_crown",
    lore:`A crown of living ice that does not melt.\n\nThe Frost Queen has no recorded name. She appeared in the Frozen Tundra roughly four hundred years ago and the ice followed. Travelers who survived encounters described a figure of absolute stillness — not cold in the way wind is cold, but cold the way marble is cold, the way space is cold.\n\nThe crown reforms if broken. It has been broken many times.\n\nIt is very beautiful. It does not care that you find it beautiful.`},

  "storm god\'s aegis": {img:"storm_gods_aegis",
    lore:`A shield of divine origin that crackles with contained lightning.\n\nThe Storm God predates the Sky Realm itself — the floating platforms were built around it, or perhaps grew from its presence, the scholars disagree. It does not speak. It does not negotiate. It regarded you as an inconvenience worthy of being struck by lightning, and you proved it wrong.\n\nThe aegis holds a fraction of that power now. Wearing it makes the air around you smell like rain.`},

  "void emperor\'s sigil": {img:"void_emperors_sigil",
    lore:`A seal of absolute darkness that nullifies light within a handspan.\n\nThe Void Emperor was not born in the Shadow Realm. It came from somewhere else and the Shadow Realm formed around it the way scar tissue forms around a wound. What it wanted — what it was doing — remains unclear. Its cultists knew. They\'re dead now too.\n\nThe sigil is its signature. Its mark. Carrying it means something in the deeper planes, in the dark between places.\n\nYou probably shouldn\'t think about what it means.`},

  "void god\'s essence": {img:"void_gods_essence",
    lore:`The condensed consciousness of the Void God, crystallized at the moment of its death.\n\nThe Void God was not a god in any traditional sense. It was the void become aware of itself — emptiness that had existed long enough to develop preferences. Its first preference was continuation. Its second was expansion.\n\nYou ended both.\n\nThe essence in your hands is what remains of something that existed before your world had a name. It should not be possible to hold. It is very heavy for something that is, technically, nothing.\n\nThis is the most significant thing you have ever done. The Void God would disagree, but it no longer can.`},

  "aldric\'s blessing": {img:"aldrics_blessing",
    lore:`A small reliquary containing Father Aldric\'s prayer, made permanent by faith.\n\nAldric has blessed thousands of travelers over forty years of priesthood. Most of those blessings were words spoken into darkness that offered no reply. This one is different. You defeated the Dungeon Lich — you broke the curse that has been bleeding this town dry for two centuries.\n\nAldric prayed over this for three hours before he gave it to you. His hands shook. He cried. He said the Fallen had answered him, finally, after forty years of silence.\n\nCarry it. It means something to him that you do.`},

  "death baron\'s crown": {img:"death_barons_crown",
    lore:`An iron crown worn by the lord of the Haunted Keep for three hundred years after his death.\n\nThe Death Baron was a nobleman whose name was struck from every record after he refused to die. He kept his estate, his title, his seat at council — for fifteen years, the other lords pretended not to notice, because the alternative was confrontation.\n\nEventually they walled up the keep and hoped the problem would resolve itself.\n\nIt did not.\n\nThe crown is heavy with old authority. The dead recognize it. That is useful, in the right circumstances.`},

  "leviathan\'s scale": {img:"leviathans_scale",
    lore:`A single scale from the Astral Leviathan, larger than your forearm.\n\nThe Astral Leviathan has been circling the vortex since before the planes stabilized into their current configuration. Travelers in the Astral Sea have reported it for millennia — it became a fixed feature of the landscape, like a mountain or a constellation.\n\nYou removed it from that landscape.\n\nThe scale is impossibly light despite its size. It refracts the light around it in patterns that seem almost intentional, as if it\'s trying to communicate something about the deep places between worlds.`},

  "prism titan\'s core": {img:"prism_titans_core",
    lore:`The crystalline heart of the Prism Titan, still refracting light in complex patterns.\n\nThe Prism Titan was the original guardian of the Crystal Caverns — not created, but grown over thousands of years as crystal formations slowly developed awareness. It was not malicious. It was territorial in the way ancient things are territorial: not from aggression but from the accumulated weight of time spent in one place.\n\nThe core continues its light-refracting function independent of the body that surrounded it. Researchers who have studied similar artifacts report the patterns are not random. No one has decoded them yet.`},
};

// ── Skill execution ───────────────────────────────────────────────────────
function execSkill(ws, p, sid, m) {
  // Skill damage: 75%-115% of base, minus defence (unless nodef), +bonus/2 extra ceiling
  const D = (base, bonus=0, nodef=false) => {
    const def  = nodef ? 0 : m.def;
    const minD = Math.max(1, Math.floor(base * 0.75) - def);
    const maxD = Math.max(minD+1, Math.floor(base * 1.15) + Math.floor(bonus/2) - def);
    const d    = rnd(minD, maxD);
    m.hp -= d;
    return d;
  };
  // Helper to show HP after skill damage
  const showHP = () => {
    if(m&&m.hp!==undefined) say(ws,`  ${m.name}: ${Math.max(0,m.hp)}/${m.maxhp} HP remaining`,'combat');
  };
  // Healing: ±15% variance
  const H = n => { const heal=rnd(Math.max(1,Math.floor(n*0.85)),Math.ceil(n*1.15)); const h=Math.min(heal,p.maxhp-p.hp); p.hp+=h; return h; };
  if (!p.cd) p.cd = {};

  switch(sid) {
    case 'power_strike':    { const r=D(p.atk*2,3);      say(ws,`POWER STRIKE — ${r} damage!`,'skill'); break; }
    case 'shield_wall':     { p.sh.wall=8;                say(ws,'SHIELD WALL — 8 damage shield!','skill'); break; }
    case 'battle_cry':      { p.bcT=3;p.bcV=3;            say(ws,'BATTLE CRY — Enemy ATK -3 for 3 turns!','skill'); break; }
    case 'second_wind':     { const r=H(15);              say(ws,`SECOND WIND — +${r} HP!`,'skill'); break; }
    case 'whirlwind':       { const r=D(p.atk*1.5,2);    say(ws,`WHIRLWIND — ${r} damage!`,'skill'); break; }
    case 'backstab':        { const mult=p.backstabUsed?1.5:3.5; p.backstabUsed=true; const r=D(p.atk*mult,2); say(ws,`BACKSTAB — ${r} vital damage!`,'skill'); break; }
    case 'smoke_bomb':      {
      const exits=Object.keys(world[p.room]&&world[p.room].exits||{});
      if(exits.length){const dir=exits[0];p.room=world[p.room].exits[dir];p.inCombat=false;p.enemy=null;say(ws,`SMOKE BOMB — Fled ${dir}!`,'skill');return'fled';}
      say(ws,'No exits!','err'); break;
    }
    case 'poison_blade':    { p.pbT=4;p.pbD=4;            say(ws,'POISON BLADE — +4 dmg/hit for 4 turns.','skill'); break; }
    case 'pickpocket':      { say(ws,'Pickpocket activates on kills.','sys'); break; }
    case 'shadowstep':      { const r=D(p.atk*2); p.sh.shadow=1; say(ws,`SHADOWSTEP — ${r} damage! Next hit dodged.`,'skill'); break; }
    case 'fireball':        { const r=D(p.atk*3,4);       say(ws,`FIREBALL — ${r} fire damage!`,'skill'); break; }
    case 'frost_bolt':      { const r=D(p.atk*2,2); p.frozenT=1; say(ws,`FROST BOLT — ${r} damage, frozen!`,'skill'); break; }
    case 'arcane_shield':   { p.sh.arcane=12;             say(ws,'ARCANE SHIELD — 12 damage barrier!','skill'); break; }
    case 'mana_drain':      { const r=D(p.atk); const h=H(10); say(ws,`MANA DRAIN — ${r} dmg, +${h} HP!`,'skill'); break; }
    case 'meteor':          { const r=D(p.atk*4,6);       say(ws,`METEOR — Catastrophic ${r} damage!`,'skill'); break; }
    case 'aimed_shot':      { const r=D(p.atk*2.5,3);    say(ws,`AIMED SHOT — ${r} precision arrow!`,'skill'); break; }
    case 'volley':          { const r=D(p.atk*2,2);       say(ws,`VOLLEY — ${r} arrow hail!`,'skill'); break; }
    case 'track':           {
      Object.keys((world[p.room]&&world[p.room].exits)||{}).forEach(dir=>{
        const rm=world[(world[p.room].exits||{})[dir]];
        if(rm){const ms=(rm.monsters||[]).filter(x=>!x.dead).map(x=>x.name).join(',')||'none';say(ws,`  ${dir.toUpperCase()} [${rm.name}] Monsters:${ms}`,'sys');}
      }); break;
    }
    case 'nature_heal':     { const r=H(14);              say(ws,`NATURE HEAL — +${r} HP!`,'skill'); break; }
    case 'eagle_eye':       { const r=D(p.atk*2,0,true);  say(ws,`EAGLE EYE — ${r} damage (ignores DEF)!`,'skill'); break; }
    case 'holy_strike':     { const r=D(p.atk*2+6,2);    say(ws,`HOLY STRIKE — ${r} divine damage!`,'skill'); break; }
    case 'lay_on_hands':    { const r=H(22);              say(ws,`LAY ON HANDS — +${r} HP!`,'skill'); break; }
    case 'divine_shield':   { p.sh.divine=true;           say(ws,'DIVINE SHIELD — Next attack blocked!','skill'); break; }
    case 'smite':           { const un=/skeleton|lich|ghost|corpse|wraith|risen|zombie/i.test(m.name); const r=D(p.atk*(un?3.5:1.5),3); say(ws,`SMITE — ${r} holy wrath!${un?' HOLY WEAKNESS!':''}`,'skill'); break; }
    case 'consecrate':      { p.consecT=3; const r=H(8);  say(ws,`CONSECRATE — +${r} HP, 4 dmg/turn to enemy.`,'skill'); break; }
    case 'tame_skill':      { doTame(ws,p); break; }
    case 'beast_roar':      { p.bcT=3;p.bcV=3; const pd=p.companion?rnd(3,8):0; if(pd>0)m.hp-=pd; say(ws,`BEAST ROAR — Enemy ATK-3!${pd?' Companion:+'+pd:''}`,'skill'); break; }
    case 'pack_attack':     { const r=D(p.atk*1.5); const pd=p.companion?rnd(5,12):0; m.hp-=pd; say(ws,`PACK ATTACK — You:${r} + Companion:${pd}!`,'skill'); break; }
    case 'wild_instinct':   { p.sh.wild=6; const r=H(8);  say(ws,`WILD INSTINCT — +${r} HP, 6 shield!`,'skill'); break; }
    case 'alpha_call':      { const r=D(p.atk*2); const pd=p.companion?rnd(8,15):0; m.hp-=pd; say(ws,`ALPHA CALL — You:${r}${pd?'+'+pd:''}!`,'skill'); break; }
    case 'raise_dead':      { doRaiseDead(ws,p); break; }
    case 'corpse_bomb':     { if(!p.zombies||!p.zombies.length){say(ws,'No zombies!','err');break;} const z=p.zombies.pop(); const r=Math.max(8,z.hp*2+rnd(0,10)); m.hp-=r; say(ws,`CORPSE BOMB — ${z.name} explodes for ${r}!`,'skill'); break; }
    case 'necrotic_bolt':   { const r=D(p.atk*2.5,3); const h=H(Math.floor(r/3)); say(ws,`NECROTIC BOLT — ${r} necrotic damage! Life drain: +${h} HP restored. [${p.hp}/${p.maxhp}]`,'skill'); break; }
    case 'death_shield':    { p.sh.death=14; say(ws,'DEATH SHIELD — A 14-point necrotic barrier surrounds you. Next 14 damage absorbed!','skill'); break; }
    case 'plague':          { p.plagueT=4;p.plagueD=5; say(ws,`PLAGUE — ${m.name} is infected! 5 necrotic damage per turn for 4 turns.`,'skill'); break; }
    case 'soul_drain':      { const r=D(p.atk*1.5); const h=H(Math.floor(r/2)); say(ws,`SOUL DRAIN — ${r} dmg, +${h} HP!`,'skill'); break; }
    case 'bone_wall':       { p.sh.bone=16;               say(ws,'BONE WALL — 16 damage barrier!','skill'); break; }
    case 'curse_skill':     { p.curseT=4;p.curseD=4; m.hp-=rnd(5,10); say(ws,'CURSE — Enemy weakened!','skill'); break; }
    case 'lich_form':       { if(!p._lichActive){p.atk+=4;p.def+=2;p._lichActive=true;} p.lichT=3; say(ws,'LICH FORM — ATK+4, DEF+2 for 3 turns!','skill'); break; }
    case 'rage':            { p.rageT=3;p.rageA=4;        say(ws,'RAGE — ATK +4 for 3 turns!','skill'); break; }
    case 'blood_lust':      { const r=D(p.atk*2); const h=H(Math.floor(r/2)); say(ws,`BLOOD LUST — ${r} dmg, +${h} HP!`,'skill'); break; }
    case 'reckless_strike': { const r=D(p.atk*3,4); p.hp=Math.max(1,p.hp-4); say(ws,`RECKLESS STRIKE — ${r} damage! -4 HP.`,'skill'); break; }
    case 'war_cry':         { p.bcT=4;p.bcV=4;            say(ws,'WAR CRY — Enemy ATK -4 for 4 turns!','skill'); break; }
    case 'frenzy':          { const r1=D(p.atk); const r2=D(p.atk); say(ws,`FRENZY — Two strikes: ${r1}+${r2}!`,'skill'); break; }
    case 'entangle':        { p.frozenT=2;                say(ws,'ENTANGLE — Enemy rooted 2 turns!','skill'); break; }
    case 'shapeshift':      { if(!p._shiftActive){p.atk+=3;p.def+=3;p._shiftActive=true;} p.shiftT=3; say(ws,'SHAPESHIFT — Bear form! ATK+3, DEF+3.','skill'); break; }
    case 'regrowth':        { p.regrowthT=3; const r=H(10); say(ws,`REGROWTH — +${r} HP now, +5/turn x3.`,'skill'); break; }
    case 'summon_wolves':   { const r=rnd(8,16); m.hp-=r;  say(ws,`SUMMON WOLVES — Pack deals ${r} damage!`,'skill'); break; }
    case 'barkskin':        { p.sh.bark=10; p.def+=2;     say(ws,'BARKSKIN — 10 shield + DEF +2!','skill'); break; }
    case 'ki_strike':       { const r=D(p.atk*2,0,true);  say(ws,`KI STRIKE — ${r} internal force (no DEF)!`,'skill'); break; }
    case 'iron_fist':       { const r=D(p.atk*2.5,3);    say(ws,`IRON FIST — ${r} devastating punch!`,'skill'); break; }
    case 'deflect':         { p.sh.deflect=1;             say(ws,'DEFLECT — Next attack dodged!','skill'); break; }
    case 'meditation':      { const r=H(18);              say(ws,`MEDITATION — +${r} HP.`,'skill'); break; }
    case 'thousand_cuts':   { let t=0; for(let i=0;i<5;i++){const r=Math.max(1,rnd(2,p.atk));m.hp-=r;t+=r;} say(ws,`THOUSAND CUTS — 5 strikes, ${t} total!`,'skill'); break; }
    case 'shadow_strike':   { const r=D(p.atk*2.5,2);    say(ws,`SHADOW STRIKE — ${r} from darkness!`,'skill'); break; }
    case 'blink':           { const r=D(p.atk*1.5); p.sh.blink=1; say(ws,`BLINK — ${r} damage! Next hit dodged.`,'skill'); break; }
    case 'curse_blade':     { p.pbT=4;p.pbD=5;            say(ws,'CURSE BLADE — +5 shadow/hit for 4 turns.','skill'); break; }
    case 'fade':            { p.sh.fade=3;                say(ws,'FADE — Next 3 hits reduced 50%.','skill'); break; }
    case 'death_mark':      { p.deathmarkT=3;             say(ws,'DEATH MARK — All damage +50% for 3 turns.','skill'); break; }
    case 'spirit_bolt':     { const r=D(p.atk*2,2);       say(ws,`SPIRIT BOLT — ${r} ancestral wrath!`,'skill'); break; }
    case 'ancestral_shield':{ p.sh.ancestral=10; const r=H(6); say(ws,`ANCESTRAL SHIELD — 10 shield, +${r} HP!`,'skill'); break; }
    case 'hex':             { p.bcT=4;p.bcV=3;p.curseT=3;p.curseD=3; say(ws,'HEX — Enemy weakened and cursed!','skill'); break; }
    case 'chain_lightning': { const r=D(p.atk*3,5);       say(ws,`CHAIN LIGHTNING — ${r} lightning!`,'skill'); break; }
    case 'totem':           { p.totemT=4;p.totemH=5;      say(ws,'TOTEM — +5 HP/turn for 4 turns!','skill'); break; }
    case 'acid_splash':     { const r=D(p.atk*1.5); p.pbT=3;p.pbD=4; say(ws,`ACID SPLASH — ${r} acid + melting armor!`,'skill'); break; }
    case 'transmute':       { if(p.gold>=10){p.gold-=10;const r=H(25);say(ws,`TRANSMUTE — 10g -> +${r} HP!`,'ok');}else say(ws,'Need 10g.','err'); break; }
    case 'brew':            { p.inventory.push('Healing Potion'); say(ws,'BREW — Crafted a Healing Potion!','ok'); break; }
    case 'explosive_flask': { const r=D(p.atk*2.5,5);    say(ws,`EXPLOSIVE FLASK — ${r} blast damage!`,'skill'); break; }
    case 'catalyst':        { if(!p._catalystActive){p.atk+=3;p._catalystActive=true;} p.catalystT=3; say(ws,'CATALYST — ATK +3 for 3 turns!','skill'); break; }
    case 'eldritch_blast':  { const r=D(p.atk*2.5,4);    say(ws,`ELDRITCH BLAST — ${r} void energy!`,'skill'); break; }
    case 'dark_pact':       { p.hp=Math.max(1,p.hp-8); if(!p._darkPactActive){p.atk+=5;p._darkPactActive=true;} p.darkpactT=4; say(ws,'DARK PACT — -8 HP, ATK +5 for 4 turns.','skill'); break; }
    case 'banish':          { p.frozenT=2; const r=D(p.atk*1.5); say(ws,`BANISH — ${r} void, stunned 2 turns.`,'skill'); break; }
    case 'soul_siphon':     { const r=D(p.atk*1.5); const h=H(r); say(ws,`SOUL SIPHON — ${r} dmg, +${h} HP!`,'skill'); break; }
    case 'doom':            { p.doomT=3;                   say(ws,'DOOM — Double damage for 3 turns!','skill'); break; }
    case 'judgement':       { const r=D(p.atk*2,2);       say(ws,`JUDGEMENT — ${r} divine!`,'skill'); break; }
    case 'holy_nova':       { const r=D(p.atk*1.5); const h=H(10); say(ws,`HOLY NOVA — ${r} dmg, +${h} HP!`,'skill'); break; }
    case 'fortress':        { p.sh.fortress=20;            say(ws,'FORTRESS — 20 damage citadel shield!','skill'); break; }
    case 'inspire':         { const h=H(12); if(!p._inspireActive){p.atk+=2;p._inspireActive=true;} p.inspireT=3; say(ws,`INSPIRE — +${h} HP, ATK+2 for 3 turns!`,'skill'); break; }
    case 'purge':           { p.pbT=0;p.plagueT=0;p.curseT=0; const h=H(8); say(ws,`PURGE — Cleansed! +${h} HP.`,'skill'); break; }
    case 'runic_strike':    { const r=D(p.atk*2,0,true);  say(ws,`RUNIC STRIKE — ${r} enchanted (no DEF)!`,'skill'); break; }
    case 'mana_shield':     { p.sh.mana=14;               say(ws,'MANA SHIELD — 14 arcane barrier!','skill'); break; }
    case 'spell_surge':     { const r=D(p.atk*3.5,5);    say(ws,`SPELL SURGE — ${r} arcane explosion!`,'skill'); break; }
    case 'counter_skill':   { p.sh.counter=1;             say(ws,'COUNTER — Next hit reflected!','skill'); break; }
    case 'arcane_blade':    { p.pbT=4;p.pbD=6; if(!p._arcaneBladeActive){p.atk+=2;p._arcaneBladeActive=true;} say(ws,'ARCANE BLADE — ATK+2, +6 magic/hit x4.','skill'); break; }
    case 'confuse':         { p.bcT=3;p.bcV=4;            say(ws,'CONFUSE — Enemy ATK -4 for 3 turns!','skill'); break; }
    case 'mirror_image':    { p.sh.mirror=2;              say(ws,'MIRROR IMAGE — Next 2 attacks miss!','skill'); break; }
    case 'jinx':            { p.curseT=4;p.curseD=5; const r=D(p.atk); say(ws,`JINX — ${r} dmg, cursed 5/turn x4.`,'skill'); break; }
    case 'larceny':         { const s=rnd(5,15);p.gold+=s; say(ws,`LARCENY — Pickpocketed ${s}g!`,'skill'); break; }
    case 'wild_magic':      { const r=rnd(1,p.atk*6);m.hp-=r; say(ws,`WILD MAGIC — Chaotic ${r} damage!`,'skill'); break; }
    case 'death_strike':    { const r=D(p.atk*2.5,3); const h=H(Math.floor(r/3)); say(ws,`DEATH STRIKE — ${r} dmg, +${h} HP!`,'skill'); break; }
    case 'dark_aura':       { p.darkAuraT=4;              say(ws,'DARK AURA — Dark skills +30% for 4 turns.','skill'); break; }
    case 'unholy_ground':   { p.plagueT=4;p.plagueD=6;    say(ws,'UNHOLY GROUND — 6 necrotic/turn x4.','skill'); break; }
    case 'bone_shield':     { p.sh.bone=18;               say(ws,'BONE SHIELD — 18 damage barrier!','skill'); break; }
    case 'soul_rend':       { const r=D(p.atk*3,5); p.frozenT=1; say(ws,`SOUL REND — ${r} damage, stunned!`,'skill'); break; }
    case 'channel_fire':    { const r=D(p.atk*2.5,4);    say(ws,`CHANNEL FIRE — ${r} elemental fire!`,'skill'); break; }
    case 'channel_ice':     { const r=D(p.atk*2,2); p.frozenT=1; say(ws,`CHANNEL ICE — ${r} damage, frozen!`,'skill'); break; }
    case 'rift':            { const r=rnd(15,p.atk*4);m.hp-=r; say(ws,`RIFT — Dimensional tear ${r} void!`,'skill'); break; }
    case 'overload':        { const r=D(p.atk*3.5,6); p.hp=Math.max(1,p.hp-6); say(ws,`OVERLOAD — ${r} explosion! -6 HP.`,'skill'); break; }
    case 'elemental_form':  { if(!p._elementalActive){p.atk+=5;p._elementalActive=true;} p.elementalT=4; say(ws,'ELEMENTAL FORM — ATK +5 for 4 turns!','skill'); break; }
  }
  // Show monster HP after any damaging skill
  if(m && m.hp!==undefined && sid!=='smoke_bomb' && sid!=='track' && sid!=='brew' && sid!=='pickpocket') {
    say(ws,`  ${m.name}: ${Math.max(0,m.hp)}/${m.maxhp} HP remaining`,'combat');
  }
}

// ── Equippable items ──────────────────────────────────────────────────────
const EQ = {
  // Bags / containers — equip to get extra carry slots
  'worn satchel':   {t:'bag',atk:0,def:0,slots:6,  desc:'A battered leather satchel. Holds 6 items.'},
  'leather satchel':{t:'bag',atk:0,def:0,slots:10, desc:'A sturdy leather satchel. Holds 10 items.'},
  'traveller bag':  {t:'bag',atk:0,def:0,slots:12, desc:'A spacious traveller bag. Holds 12 items.'},
  'merchant sack':  {t:'bag',atk:0,def:0,slots:15, desc:'A large merchant sack. Holds 15 items.'},
  'magic satchel':  {t:'bag',atk:0,def:0,slots:20, desc:'A satchel with magical extra-dimensional space. Holds 20 items.'},
  // ── Quest reward weapons ───────────────────────────────────────────────
  "knight's sword":   {t:'weapon',atk:10,def:0, desc:"A finely balanced sword."},
  'bone staff':       {t:'weapon',atk:10,def:1, desc:"A staff carved from dungeon bones."},
  // ── Boss drop weapons ────────────────────────────────────────────────────
  'silver sword':     {t:'weapon',atk:12,def:1, desc:"Githyanki silver, never dulls."},
  'cursed blade':     {t:'weapon',atk:14,def:0, desc:"Radiates dark energy. Unsettling."},
  'frost blade':      {t:'weapon',atk:14,def:2, desc:"Permanently cold. Slows enemies."},
  // ── Boss drop armor ──────────────────────────────────────────────────────
  'cultist robe':     {t:'armor', atk:2, def:1, desc:"Dark cloth stitched with runes."},
  // ── Legendary boss crowns / trophies (wearable) ──────────────────────────
  "lich's crown":     {t:'armor', atk:3, def:5, desc:"The Dungeon Lich's iron crown. Radiates dark power. Intimidates all who see it."},
  "titan's core":     {t:'trinket',atk:5,def:3, desc:"The Flame Titan's molten heart. Burns cold in your hand."},
  "frost queen's crown":{t:'armor',atk:2,def:6, desc:"Ice crown of the Frost Queen. Bitter cold, beautiful."},
  "storm god's aegis":{t:'armor', atk:0,def:8, desc:"Divine shield of the Storm God. Lightning crackles across its surface."},
  "void emperor's sigil":{t:'trinket',atk:6,def:4,desc:"The Void Emperor's seal. Reality wavers around it."},
  "prism titan's core":{t:'trinket',atk:5,def:5,desc:"A crystalline core that refracts all light."},
  "death baron's crown":{t:'armor',atk:4,def:7, desc:"The Death Baron's iron crown. Commands respect — and fear."},
  "leviathan's scale": {t:'armor', atk:2,def:9, desc:"Astral dragon scale. Near impenetrable."},
  "void god's essence":{t:'trinket',atk:8,def:6, desc:"The essence of the Void God. Terrible, beautiful power."},
  // ── Craftable items already registered above ─────────────────────────────
  "bandit king's blade":{t:'weapon',atk:16,def:2,desc:'Heavy cleaver of the Bandit King. Notched from countless fights.'},
  'silver ring':{t:'armor',atk:0,def:1},"ranger's bow":{t:'weapon',atk:6,def:0},
  'forest cloak':{t:'armor',atk:0,def:3},'enchanted gem':{t:'trinket',atk:2,def:2},
  'rusty sword':{t:'weapon',atk:2,def:0},'iron sword':{t:'weapon',atk:4,def:0},
  'battle axe':{t:'weapon',atk:7,def:-1},"knight's sword":{t:'weapon',atk:10,def:0},
  'shadow blade':{t:'weapon',atk:15,def:2},'leather armor':{t:'armor',atk:0,def:2},
  'chain mail':{t:'armor',atk:0,def:4},'plate armor':{t:'armor',atk:0,def:7},
  'iron shield':{t:'armor',atk:0,def:3},'envenomed dagger':{t:'weapon',atk:12,def:0},
  'void cloak':{t:'armor',atk:2,def:5},'frost blade':{t:'weapon',atk:14,def:2},
  "warrior's blade":{t:'weapon',atk:13,def:1},'shadow cloak':{t:'armor',atk:1,def:6},
  'venomsteel dagger':{t:'weapon',atk:16,def:0},'arcane tome':{t:'weapon',atk:8,def:2},
  'dragon scale mail':{t:'armor',atk:0,def:12},'void blade':{t:'weapon',atk:20,def:3},
  'troll hide armor':{t:'armor',atk:0,def:9},'bone staff':{t:'weapon',atk:10,def:1},
  // ── Ashford / trail items ─────────────────────────────────────────────────
  'ashford steel blade':{t:'weapon',atk:14,def:1,desc:'Ashford-tempered frontier steel. Holds an edge in the worst conditions.'},
  'ironclad hauberk':   {t:'armor', atk:0, def:8, desc:'Riveted iron plates over chain backing. Heavy, effective frontier armour.'},
  'runebound dagger':   {t:'weapon',atk:14,def:1,desc:'Envenomed blade inscribed with binding runes. Cuts and curses.'},
  "warden's shield":    {t:'armor', atk:0, def:5, desc:"Ashford Frontier Guard shield. Solid oak and iron banding."},
  "barrow king's crown":{t:'armor', atk:2, def:4, desc:'The burial crown of an ancient hill chieftain. Old power clings to it.'},
  "road captain's badge":{t:'trinket',atk:1,def:1,desc:"Badge of authority over the King's Road. Intimidating to those who know it."},
  // ── Ironveil Mine tools ───────────────────────────────────────────────────
  'iron pickaxe':  {t:'weapon', atk:5, def:0, desc:'A sturdy mining pickaxe. Equip to mine ore — 10 strikes before the head dulls. +5 ATK against mine mobs.'},
  'steel pickaxe': {t:'weapon', atk:5, def:0, desc:'A well-tempered steel pickaxe. Equip to mine ore — 20 strikes before it dulls. +5 ATK against mine mobs.'},
  // ── Ironveil Mine crafted items ───────────────────────────────────────────
  "miner's mail":   {t:'armor', atk:0, def:6, desc:'Riveted iron plates lined with cave spider silk. Surprisingly light for its protection rating.'},
  "ore blade":      {t:'weapon',atk:12,def:1,desc:'Forged from pure iron ingot and volcanic obsidian. The edge holds even against stone armour.'},
  "silver band":    {t:'trinket',atk:1,def:2,desc:'A ring of refined silver inlaid with cave moss resin. Faint protective enchantment lingers in the silver.'},
  // ── Frostheim Norse gear ───────────────────────────────────────────────────
  "runic axe":       {t:'weapon',atk:16,def:0,  desc:"A broad-headed axe with runic script hammered into both cheeks of the blade. The runes are a prayer to Tyr. Sigrid won't translate them for outsiders."},
  "frost spear":     {t:'weapon',atk:14,def:1,  desc:'Eight feet of ash shaft with a leaf-shaped iron head coated in a permanent frost. The cold doesn\'t affect the wielder. It affects everything else.'},
  "berserker blade": {t:'weapon',atk:18,def:-1, desc:'A two-handed sword forged for warriors who fight without shields and consider defence an insult. The edge is brutal. The balance is worse.'},
  "thunder maul":    {t:'weapon',atk:20,def:-2, desc:'A war maul said to carry a fragment of a storm giant\'s power. Hitting something with it is less like striking and more like weather.'},
  "frost plate":     {t:'armor', atk:0, def:10, desc:'Full plate forged in the Frostheim tradition — cold iron over insulating wool and hide. Heavier than southern plate but warmer and equally hard to penetrate.'},
  "runewood shield": {t:'armor', atk:0, def:6,  desc:'A round shield of iron-banded runewood, runes carved on the front face. The wood comes from a tree that grew above the snowline for two centuries.'},
  "norse chain":     {t:'armor', atk:0, def:8,  desc:'Riveted iron rings in a Norse pattern, worn over thick wool. Better cold-weather protection than southern mail and comparable defence.'},
  "bearskin cloak":  {t:'armor', atk:1, def:5,  desc:'A full bearskin cloak taken from a mountain bear, cured and fitted. Warm enough to sleep in the snow. Intimidating enough that some fights don\'t start.'}
};

// ── Shops ─────────────────────────────────────────────────────────────────
const SHOPS = {
  weaponsmith:{name:"Grimwald's Weaponsmith",greet:"Grimwald grunts. 'Fine steel. Fair prices.'",items:[
    {name:'Worn Satchel',cost:20,t:'bag',slots:6},{name:'Leather Satchel',cost:60,t:'bag',slots:10},{name:'Traveller Bag',cost:120,t:'bag',slots:12},
    {name:'Rusty Sword',cost:10,t:'weapon',atk:2,def:0},{name:'Iron Sword',cost:30,t:'weapon',atk:4,def:0},
    {name:'Battle Axe',cost:60,t:'weapon',atk:7,def:-1},{name:"Knight's Sword",cost:120,t:'weapon',atk:10,def:0},
    {name:'Shadow Blade',cost:250,t:'weapon',atk:15,def:2},{name:'Leather Armor',cost:25,t:'armor',atk:0,def:2},
    {name:'Chain Mail',cost:70,t:'armor',atk:0,def:4},{name:'Plate Armor',cost:180,t:'armor',atk:0,def:7},
    {name:'Iron Shield',cost:40,t:'armor',atk:0,def:3}
  ]},
  apothecary:{name:"Mira's Apothecary",greet:"'Name your ailment.'",items:[
    {name:'Healing Potion',cost:12,t:'potion',heal:20},{name:'Greater Heal',cost:30,t:'potion',heal:50},
    {name:'Full Restore',cost:80,t:'potion',heal:9999},{name:'Strength Tonic',cost:50,t:'tonic',atk:3},
    {name:'Iron Skin Draught',cost:50,t:'tonic',def:2},{name:'Antidote',cost:8,t:'potion',heal:0},
    {name:'beast treat',cost:15,t:'item'}
  ]},
  black_market:{name:'The Shadow Broker',greet:"'No questions. No receipts.'",items:[
    {name:'Merchant Sack',cost:200,t:'bag',slots:15},{name:'Magic Satchel',cost:500,t:'bag',slots:20},
    {name:'Envenomed Dagger',cost:200,t:'weapon',atk:12,def:0},{name:'Void Cloak',cost:180,t:'armor',atk:2,def:5},
    {name:'Elixir of Power',cost:300,t:'tonic',atk:8},{name:'Elixir of Stone',cost:300,t:'tonic',def:8},
    {name:'Phoenix Draught',cost:150,t:'potion',heal:9999}
  ]},
  ashford_store:{name:"Martas General Store",greet:"Marta eyes you. 'Coin upfront. No trouble.'",items:[
    {name:'Healing Potion',cost:10,t:'potion',heal:20},{name:'Antidote',cost:6,t:'potion',heal:0},
    {name:'Worn Satchel',cost:15,t:'bag',slots:6},{name:'torch',cost:2,t:'item'},
    {name:'Iron Sword',cost:25,t:'weapon',atk:4,def:0},{name:'Leather Armor',cost:20,t:'armor',atk:0,def:2},
    {name:'swamp herb',cost:5,t:'item'},{name:'crude map',cost:3,t:'item'}
  ]},
  ashford_healer:{name:"Brother Finn Healing Post",greet:"Finn smiles gently. 'The light mend you, traveller.'",items:[
    {name:'Healing Potion',cost:10,t:'potion',heal:20},{name:'Greater Heal',cost:25,t:'potion',heal:50},
    {name:'Full Restore',cost:70,t:'potion',heal:9999},{name:'swamp herb',cost:4,t:'item'},
    {name:'Antidote',cost:6,t:'potion',heal:0},{name:'beast treat',cost:12,t:'item'}
  ]},
  the_crucible:{name:"Torvar's Crucible",greet:"Torvar looks up. 'Buy, sell, or craft. Crafting costs gold here.'",items:[
    {name:'Iron Sword',cost:35,t:'weapon',atk:4,def:0},{name:'Battle Axe',cost:80,t:'weapon',atk:7,def:-1},
    {name:"Knight's Sword",cost:150,t:'weapon',atk:10,def:0},{name:'Chain Mail',cost:90,t:'armor',atk:0,def:4},
    {name:'Plate Armor',cost:220,t:'armor',atk:0,def:7},{name:'Iron Shield',cost:55,t:'armor',atk:0,def:3},
    {name:'Ashford Steel Blade',cost:300,t:'weapon',atk:14,def:1},{name:'Ironclad Hauberk',cost:280,t:'armor',atk:0,def:8}
  ]},
  arcane_vault:{name:"Elyndra's Arcane Vault",greet:"Elyndra: 'Handle with care. Some of these items are not entirely stable.'",items:[
    {name:'Arcane Tome',cost:180,t:'weapon',atk:8,def:2},{name:'Void Cloak',cost:200,t:'armor',atk:2,def:5},
    {name:'Runebound Dagger',cost:320,t:'weapon',atk:14,def:1},{name:"Warden's Shield",cost:200,t:'armor',atk:0,def:5},
    {name:'Elixir of Power',cost:350,t:'tonic',atk:8},{name:'Elixir of Stone',cost:350,t:'tonic',def:8}
  ]},
  shadow_market_ashford:{name:"Vex's Shadow Market",greet:"Vex grins. 'Don't tell anyone you were here.'",items:[
    {name:'Envenomed Dagger',cost:220,t:'weapon',atk:12,def:0},{name:'Shadow Blade',cost:280,t:'weapon',atk:15,def:2},
    {name:'Merchant Sack',cost:220,t:'bag',slots:15},{name:'Magic Satchel',cost:550,t:'bag',slots:20},
    {name:'Phoenix Draught',cost:160,t:'potion',heal:9999},{name:"Ranger's Bow",cost:160,t:'weapon',atk:9,def:0}
  ]},
  deadwood_apothecary:{name:"Sister Maren's Apothecary",greet:"Maren looks up. 'Looking for something stronger than a simple potion?'",items:[
    {name:'Greater Heal',cost:35,t:'potion',heal:50},{name:'Full Restore',cost:90,t:'potion',heal:9999},
    {name:'Strength Tonic',cost:60,t:'tonic',atk:3},{name:'Iron Skin Draught',cost:60,t:'tonic',def:2},
    {name:'Elixir of Power',cost:350,t:'tonic',atk:8},{name:'deepwood root',cost:25,t:'item'},{name:'Antidote',cost:8,t:'potion',heal:0}
  ]},
  prospector:{name:"Varn's Mining Post",greet:"Old Varn squints. 'Pickaxe and patience — that's the whole secret. Ores sell well if you bring them back alive.'",items:[
    {name:'Iron Pickaxe',cost:30,t:'item'},{name:'Steel Pickaxe',cost:80,t:'item'},
    {name:'Healing Potion',cost:15,t:'potion',heal:20},{name:'torch',cost:2,t:'item'},
    {name:'Antidote',cost:8,t:'potion',heal:0}
  ]},
  frostheim_market:{name:"Freya's Trading Post",greet:"Freya Stonehand nods. 'Cold enough for you? Good. Buy something warm.'",items:[
    {name:'Healing Potion',cost:15,t:'potion',heal:20},{name:'Greater Heal',cost:38,t:'potion',heal:50},
    {name:'Full Restore',cost:95,t:'potion',heal:9999},{name:'Antidote',cost:9,t:'potion',heal:0},
    {name:'torch',cost:2,t:'item'},{name:'mead',cost:8,t:'item'},{name:'swamp herb',cost:5,t:'item'}
  ]},
  frostheim_smith:{name:"Sigrid's Forge",greet:"Sigrid sets down her hammer. 'Southern steel is soft. Mine is not. Browse.'",items:[
    {name:'Runic Axe',cost:280,t:'weapon',atk:16,def:0},{name:'Frost Spear',cost:250,t:'weapon',atk:14,def:1},
    {name:'Norse Chain',cost:220,t:'armor',atk:0,def:8},{name:'Runewood Shield',cost:190,t:'armor',atk:0,def:6},
    {name:'Iron Shield',cost:55,t:'armor',atk:0,def:3}
  ]},
  frostheim_armory:{name:'The Frostheim Armory',greet:"'These are not for the timid.' — etched above the door.",items:[
    {name:'Berserker Blade',cost:420,t:'weapon',atk:18,def:-1},{name:'Thunder Maul',cost:520,t:'weapon',atk:20,def:-2},
    {name:'Frost Plate',cost:460,t:'armor',atk:0,def:10},{name:'Bearskin Cloak',cost:310,t:'armor',atk:1,def:5}
  ]},
  volva_potions:{name:"Völva's Remedies",greet:"The seeress speaks without turning. 'I know what ails you. I usually know before you do.'",items:[
    {name:'Full Restore',cost:88,t:'potion',heal:9999},{name:'Greater Heal',cost:32,t:'potion',heal:50},
    {name:'Strength Tonic',cost:65,t:'tonic',atk:3},{name:'Iron Skin Draught',cost:65,t:'tonic',def:2},
    {name:'Antidote',cost:8,t:'potion',heal:0},{name:'rune stone',cost:45,t:'item'}
  ]},
  pet_store:{name:"Pip's Exotic Menagerie",greet:"Pip beams. 'Every pet is friendly. Mostly!'",items:[
    {name:'Black Cat',cost:30,t:'pet',atk:3,hp:20,agi:8},{name:'War Hound',cost:80,t:'pet',atk:8,hp:40,agi:7},
    {name:'Raven',cost:50,t:'pet',atk:4,hp:18,agi:9},{name:'Cave Bear',cost:150,t:'pet',atk:11,hp:55,agi:4},
    {name:'Shadow Fox',cost:120,t:'pet',atk:9,hp:35,agi:10},{name:'Frost Hawk',cost:100,t:'pet',atk:8,hp:30,agi:11},
    {name:'Iron Tortoise',cost:90,t:'pet',atk:5,hp:70,agi:2},{name:'Imp',cost:200,t:'pet',atk:12,hp:30,agi:9}
  ]}
};

// ── Tameable monsters ─────────────────────────────────────────────────────
const TAMEABLE = {
  // name: {atk, hp, levelReq} — player must be >= levelReq to tame
  'Giant Rat':     {atk:3,  hp:15, levelReq:1 },
  'Timber Wolf':   {atk:6,  hp:30, levelReq:2 },
  'Swamp Serpent': {atk:7,  hp:25, levelReq:3 },
  'Forest Troll':  {atk:9,  hp:45, levelReq:5 },
  'Bog Witch':     {atk:10, hp:40, levelReq:8 },
  'Young Dragon':  {atk:14, hp:60, levelReq:12},
};

// ── Crafting recipes ──────────────────────────────────────────────────────
const RECIPES = [
  {name:"Warrior's Blade",  result:"Warrior's Blade",  ing:['Iron Sword','obsidian shard','bone shard']},
  {name:"Shadow Cloak",     result:"Shadow Cloak",     ing:['forest cloak','void crystal','shadow essence']},
  {name:"Venomsteel Dagger",result:"Venomsteel Dagger",ing:['Envenomed Dagger','serpent fang','void crystal']},
  {name:"Dragon Scale Mail",result:"Dragon Scale Mail",ing:['dragon scale','dragon scale','Chain Mail']},
  {name:"Void Blade",       result:"Void Blade",       ing:['Shadow Blade','void crystal','void crystal']},
  {name:"Greater Heal",     result:"Greater Heal",     ing:['Healing Potion','Healing Potion','swamp herb']},
  {name:"Bone Staff",       result:"Bone Staff",       ing:['bone shard','bone shard','ancient rune']},
  {name:"Troll Hide Armor", result:"Troll Hide Armor", ing:['troll hide','troll hide','Leather Armor']}
];

// ── Crucible recipes (Ashford — costs gold) ───────────────────────────────
const CRUCIBLE_RECIPES = [
  {name:"Ashford Steel Blade",result:"Ashford Steel Blade",ing:['Iron Sword','obsidian shard','troll hide'],   gold:50},
  {name:"Ironclad Hauberk",   result:"Ironclad Hauberk",   ing:['Chain Mail','troll hide','bone shard'],       gold:75},
  {name:"Runebound Dagger",   result:"Runebound Dagger",   ing:['Envenomed Dagger','ancient rune','cave moss'], gold:100},
  {name:"Warden's Shield",    result:"Warden's Shield",    ing:['Iron Shield','obsidian shard','bone shard'],   gold:60},
  {name:"Iron Ingot",         result:"Iron Ingot",         ing:['iron ore','iron ore','coal'],                  gold:20},
  {name:"Miner's Mail",       result:"Miner's Mail",       ing:['Iron Ingot','Iron Ingot','spider silk'],        gold:85},
  {name:"Ore Blade",          result:"Ore Blade",          ing:['Iron Ingot','obsidian shard','coal'],           gold:95},
  {name:"Silver Band",        result:"Silver Band",        ing:['silver ore','silver ore','cave moss'],          gold:60}
];

// ── World ─────────────────────────────────────────────────────────────────
const M = (id,name,hp,atk,def,xp,gold,loot,agi) => ({id,name,hp,maxhp:hp,atk,def,xp,gold,loot,dead:false,agi:agi||Math.floor((atk+def)/2)});
const WT = {
  // Town
  town_square:     {zone:'JAMES VILLAGE',name:'Town Square',ambient:'town',desc:'The cobblestone square hums with magical energy. At its centre the Adventure Shrine crackles with azure light. A notice board lists bounties.',exits:{north:'market_street',east:'tavern',south:'south_gate',west:'temple',up:'adventure_shrine'},base:['old coin'],mon:[],shop:null,teleport:false},
  adventure_shrine:{zone:'JAMES VILLAGE',name:'The Adventure Shrine',desc:'Ancient standing stones pulse with power. The Keeper tends the runes, whispering the names of distant lands.',exits:{down:'town_square'},base:[],mon:[],shop:null,teleport:true},
  market_street:   {zone:'JAMES VILLAGE',name:'Market Street',desc:'A cobblestone lane. The smith hammers to the north. The Menagerie banners hang to the west.',exits:{south:'town_square',north:'weaponsmith',east:'alley',west:'pet_store'},base:[],mon:[],shop:null},
  pet_store:       {zone:'JAMES VILLAGE',name:"Pip's Exotic Menagerie",tileImg:'pips_pet_shop',desc:'A riot of cages and exotic animals. Pip the halfling beams from behind the counter.',exits:{east:'market_street'},base:[],mon:[],shop:'pet_store'},
  weaponsmith:     {zone:'JAMES VILLAGE',name:"Grimwald's Weaponsmith",tileImg:'grimwalds_weapon_shop',desc:'The forge blazes. Weapons line the walls. Grimwald watches with arms crossed. A heavy iron door stands north of the forge — something is etched into it.',exits:{south:'market_street',north:'grimwald_back'},base:[],mon:[],shop:'weaponsmith'},
  grimwald_back:   {zone:'THE FORGOTTEN ARCADE',name:"Grimwald's Back Room",desc:"A cavernous chamber hidden behind the forge, lit entirely by the warm glow of vintage arcade cabinets. CRT screens hum. Pixel art flickers on dusty glass. Three machines stand ready — Orc Invaders, Dragon Battle, and Dragon's Greed. Passages lead west, east, and north. A deep crimson glow pulses from the northern arch.",exits:{south:'weaponsmith',west:'arcade_trail',east:'arcade_c64',north:'arcade_theater'},base:[],mon:[],shop:null,arcadeRoom:true},
  arcade_theater:  {zone:'THE FORGOTTEN ARCADE',name:'The Phantom Cinema',desc:"A forgotten movie house tucked behind the arcade. Rows of cracked velvet seats face a vast silver screen framed by moth-eaten curtains the colour of dried blood. A brass projector clatters softly in a glass booth overhead. Handpainted bulb-letters on the marquee read THE PHANTOM CINEMA. The faint smell of phantom popcorn lingers in the still air.",exits:{south:'grimwald_back'},base:[],mon:[],shop:null,theaterRoom:true},
  arcade_trail:    {zone:'THE FORGOTTEN ARCADE',name:'The Oregon Trail Cabinet',desc:"An alcove bathed in green-phosphor glow. A mural of covered wagons crossing sun-baked plains runs floor to ceiling. The cabinet shows a lone wagon at the edge of an endless prairie. Carved into the wooden frame: 'Have a Good Trip — See You Next Fall.'",exits:{east:'grimwald_back'},base:[],mon:[],shop:null,trailRoom:true},
  arcade_c64:      {zone:'THE FORGOTTEN ARCADE',name:'The C64 Corner',desc:"A Commodore 64 setup fills this nook — chunky cream case, 1702 monitor glowing blue, datasette, and a shoebox of floppy disks labelled in marker. Four games loaded and ready. The READY prompt blinks, waiting.",exits:{west:'grimwald_back'},base:[],mon:[],shop:null,c64Room:true},
  alley:           {zone:'JAMES VILLAGE',name:'Dark Alley',desc:'A narrow passage reeking of mildew. A crude map nailed to a post.',exits:{west:'market_street',south:'black_market',north:'map_shop'},base:['crude map'],mon:[],shop:null},
  map_shop:        {zone:'JAMES VILLAGE',name:"The Cartographer's Den",desc:"A low-ceilinged shop packed with scrolled maps and measuring tools. The east wall is covered floor to ceiling with a massive parchment map of the entire known realm. Tunnels carved into the far wall suggest something has been burrowing here for a very long time.",exits:{south:'alley'},base:[],mon:[],shop:null,moleTip:true},
  black_market:    {zone:'JAMES VILLAGE',name:'The Shadow Broker',desc:'A cellar. A single lantern. A hooded figure utterly still.',exits:{north:'alley'},base:[],mon:[],shop:'black_market'},
  tavern:          {zone:'JAMES VILLAGE',name:'The Broken Flagon',ambient:'tavern',desc:'A tavern frozen in time. Half-full tankards, a smouldering hearth. Tormund is behind the bar.',exits:{west:'town_square',east:'apothecary'},base:[],mon:[],shop:null},
  apothecary:      {zone:'JAMES VILLAGE',name:"Mira's Apothecary",desc:'Shelves of vials and herbs. Mira works at her bench without looking up.',exits:{west:'tavern'},base:[],mon:[],shop:'apothecary'},
  temple:          {zone:'JAMES VILLAGE',name:'Temple of the Fallen',ambient:'temple',desc:'A once-grand temple half in ruin. Father Aldric kneels at the altar. North leads to the Guild District. A dirt road leads west toward the mines.',exits:{east:'town_square',south:'temple_crypt',north:'guild_district',west:'west_road'},base:[],mon:[],shop:null},
  south_gate:      {zone:'JAMES VILLAGE',name:'South Gate',desc:'Iron-banded doors torn from their hinges, marking the southern edge of James Village. The Ashwood Forest stretches south, dungeon stairs descend beneath the gate, and the flooded ruins of two drowned houses of worship flank the gate road.',exits:{north:'town_square',south:'ashwood_edge',down:'dungeon_entrance',east:'drowned_cathedral_sunken_steps',west:'drowned_monastery_entrance'},base:['torch'],mon:[],shop:null},
  guild_district:  {zone:'JAMES VILLAGE',name:'Guild District',desc:'A broad lane of imposing guild buildings. The Guild Registry is north. Guild Hall Row is east.',exits:{south:'temple',north:'guild_registry',east:'guild_hall_row'},base:[],mon:[],shop:null,guildDistrict:true},
  guild_registry:  {zone:'JAMES VILLAGE',name:'Guild Registry',desc:'An officious clerk in spectacles surrounded by ledgers. Type GUILD LIST to see guilds, GUILD CREATE [name] to register yours. A notice on the wall mentions a northern road to the mountain settlements.',exits:{south:'guild_district',north:'north_gate'},base:[],mon:[],shop:null},
  guild_hall_row:  {zone:'JAMES VILLAGE',name:'Guild Hall Row',desc:'A row of grand hall entrances. Each bears its guild name above the door. Type GUILDHALL to enter yours.',exits:{west:'guild_district'},base:[],mon:[],shop:null,guildHallRow:true},
  // ── Ironveil Mines ─────────────────────────────────────────────────────
  west_road:       {zone:'IRONVEIL ROAD',name:'West Road',desc:"A broad packed-dirt road runs west from the temple district, narrowing steadily as it climbs into the hills. Ruts from heavy ore carts score the earth. The distant clang of steel on rock drifts down from the ridgeline. A weathered signpost reads: IRONVEIL MINES — 2 LEAGUES.",exits:{east:'temple',west:'mine_trail_1'},base:[],mon:[M('road_bandit','Road Bandit',18,5,2,38,12,'crude map',4)],shop:null},
  mine_trail_1:    {zone:'IRONVEIL ROAD',name:'The Mine Road',desc:"The trail winds between scrub oak and exposed limestone bluffs. Quartz veins flash in the cliff face to the north where an old open quarry once operated. Cart tracks in the mud lead onward. A battered sign: IRONVEIL MINES — PROCEED WITH CAUTION.",exits:{east:'west_road',west:'mine_trail_2',north:'quarry_outlook'},base:['torch'],mon:[M('road_bandit','Road Bandit',20,5,2,42,13,'crude map',4),M('rock_snake','Rock Snake',16,5,1,32,8,'serpent fang',5)],shop:null},
  mine_trail_2:    {zone:'IRONVEIL ROAD',name:'The Winding Descent',desc:'The road dips into a narrow ravine. Limestone walls tower on both sides, layered in rust and grey. Old support timbers brace the cliff face at intervals. The cave entrance gapes ahead, exhaling cold mineral air and the faint smell of tallow.',exits:{east:'mine_trail_1',west:'mine_entrance'},base:[],mon:[M('cave_spider','Cave Spider',22,6,2,48,10,'spider silk',5),M('rock_snake','Rock Snake',18,5,2,36,9,'serpent fang',5)],shop:null},
  quarry_outlook:  {zone:'IRONVEIL ROAD',name:'Quarry Overlook',desc:'A crumbling ledge overlooks an old open-air quarry, long since worked dry. Rusted tools lie half-buried in rubble and thistles. The view west shows the full breadth of the mine complex carved into the hillside. Something down in the quarry is moving — rocks that really should not be.',exits:{south:'mine_trail_1'},base:['old coin','torch'],mon:[M('stone_gnome','Stone Gnome',25,7,3,55,14,'cave moss',4)],shop:null},
  mine_entrance:   {zone:'IRONVEIL MINES',name:'Mine Entrance',desc:"Rough-hewn timbers frame the cave mouth. A lantern on an iron hook throws orange light over walls of cut stone. Old Varn — a weathered prospector with a pickaxe scar down one cheek — runs a small supply post here. You'll need a pickaxe before heading deeper. SHOP to browse his stock.",exits:{east:'mine_trail_2',north:'copper_mine',west:'iron_vein'},base:[],mon:[],shop:'prospector'},
  copper_mine:     {zone:'IRONVEIL MINES',name:'Copper Vein',desc:'Green-tinged streaks run through the stone walls — copper ore, rich and close to the surface. A rusted mining cart sits half-full on old rails. The air tastes of metal and old candle wax. Type MINE to work the rock face.',exits:{south:'mine_entrance'},base:[],mon:[M('cave_spider','Cave Spider',24,6,2,52,11,'spider silk',5),M('stone_gnome','Stone Gnome',28,7,3,58,14,'cave moss',4)],shop:null,mineable:['copper ore','copper ore','cave moss']},
  coal_tunnel:     {zone:'IRONVEIL MINES',name:'The Coal Shaft',desc:'Black walls, black floor, black ceiling — coal seams so thick they swallow the lantern light. The air is warm and carries the faint smell of ancient fire. Your torch burns hotter here. Type MINE to chip out coal.',exits:{north:'iron_vein'},base:[],mon:[M('cave_spider','Cave Spider',26,7,2,56,12,'spider silk',5),M('rock_crawler','Rock Crawler',32,8,4,72,18,'cave moss',5)],shop:null,mineable:['coal','coal','copper ore']},
  iron_vein:       {zone:'IRONVEIL MINES',name:'Iron Heart',desc:'The tunnels open into a wide chamber threaded with iron ore veins glowing dull red in the torchlight. The walls ring when struck. Whatever volcanic process created this seam was violent and ancient. Something has made a nest here. Type MINE to extract ore.',exits:{east:'mine_entrance',south:'coal_tunnel',west:'silver_lode'},base:[],mon:[M('rock_crawler','Rock Crawler',35,8,4,78,20,'cave moss',5),M('iron_golem_shard','Iron Golem Shard',45,10,5,110,28,'iron shard',4)],shop:null,mineable:['iron ore','iron ore','coal']},
  silver_lode:     {zone:'IRONVEIL MINES',name:'The Silver Lode',desc:"The deepest part of the mine, sealed behind a collapsed tunnel that someone re-opened recently. The walls glitter with silver threads so dense they look woven into the rock. The air is completely still. Something shares this chamber with you and is not inclined to leave. A fissure in the south wall breathes volcanic heat. Type MINE to extract silver.",exits:{east:'iron_vein',down:'volcanic_peak'},base:['ancient rune'],mon:[M('iron_golem_shard','Iron Golem Shard',50,11,5,120,30,'iron shard',4),M('mine_wraith','Mine Wraith',38,10,2,100,25,'void crystal',7)],shop:null,mineable:['silver ore','iron ore','silver ore']},
  // ── Frostheim Trail (north of Shadowmere, through the mountains) ──────────
  north_gate:          {zone:'FROSTHEIM TRAIL',name:'North Gate',desc:'The northern edge of Shadowmere. A dirt road climbs immediately into the foothills. A notice board shows the trail north to Frostheim.',exits:{south:'guild_registry',north:'mountain_foothills'},base:[],mon:[],shop:null},
  mountain_foothills:  {zone:'FROSTHEIM TRAIL',name:'Mountain Foothills',desc:'Rolling foothills, first snow patches in the hollows. The trail climbs steadily. A lookout shelf juts to the east. On clear days the distant Frostheim watchtower is visible above the treeline.',exits:{south:'north_gate',north:'frost_trail_1',east:'mountain_lookout'},base:[],mon:[M('ice_wolf','Ice Wolf',45,11,3,120,25,'frost pelt',8),M('mountain_bandit','Mountain Bandit',40,10,3,95,22,'crude map',5)],shop:null},
  mountain_lookout:    {zone:'FROSTHEIM TRAIL',name:'Mountain Lookout',desc:'A natural rock shelf with a sweeping view south over the Shadowmere valley. Old fire rings and carved initials mark generations of travellers resting here.',exits:{west:'mountain_foothills'},base:['old coin'],mon:[M('ice_wolf','Ice Wolf',45,11,3,120,25,'frost pelt',8)],shop:null},
  frost_trail_1:       {zone:'FROSTHEIM TRAIL',name:'Frost Trail',desc:'The road gives way to a rocky trail. A stone cairn marks the junction. Ice Wolf tracks cross the path. Snow covers the north-facing slopes. The mountains ahead are white from the midpoint up.',exits:{south:'mountain_foothills',east:'frost_trail_2'},base:['torch'],mon:[M('ice_wolf','Ice Wolf',48,11,3,125,26,'frost pelt',8),M('frost_troll','Frost Troll',60,13,4,160,35,'troll hide',6)],shop:null},
  frost_trail_2:       {zone:'FROSTHEIM TRAIL',name:'Rocky Switchbacks',desc:'Tight switchbacks climb through snow and ice. The trail narrows. A glacier cave opens to the east. The view drops away to the south.',exits:{west:'frost_trail_1',north:'frost_trail_3',east:'glacier_cave'},base:[],mon:[M('frost_troll','Frost Troll',62,13,4,165,36,'troll hide',6),M('mountain_bandit','Mountain Bandit',45,11,3,100,24,'crude map',5)],shop:null},
  glacier_cave:        {zone:'FROSTHEIM TRAIL',name:'Glacier Cave',desc:'A cave of ancient glacial ice, walls translucent blue-green and faintly glowing. Ancient objects frozen in the walls. The cold here is absolute and old. An Ice Golem guards the deep end.',exits:{west:'frost_trail_2'},base:['ice shard','ice shard'],mon:[M('ice_golem','Ice Golem',75,14,6,200,45,'ice shard',4),M('snow_wraith','Snow Wraith',50,12,2,130,28,'ghost essence',9)],shop:null},
  frost_trail_3:       {zone:'FROSTHEIM TRAIL',name:'The High Pass',desc:'The trail narrows to two wide, rock walls channelling the wind. A fraying rope guides you along the most exposed section. A second cairn marks the summit: "THOSE WHO PASS ARE COUNTED AMONG THE WORTHY."',exits:{south:'frost_trail_2',west:'ice_pass'},base:[],mon:[M('frost_troll','Frost Troll',65,14,4,170,38,'troll hide',6),M('snow_wraith','Snow Wraith',52,12,2,135,29,'ghost essence',9)],shop:null},
  ice_pass:            {zone:'FROSTHEIM TRAIL',name:'Ice Pass',desc:'A narrow corridor between cliff faces coated in six inches of clear ice. Ancient footholds cut into the worst sections. At the end of the pass the plateau opens and Frostheim smoke is visible on clear days.',exits:{east:'frost_trail_3',north:'storm_ridge'},base:['ice shard'],mon:[M('ice_golem','Ice Golem',78,14,6,205,46,'ice shard',4),M('frost_giant','Frost Giant',100,16,6,350,80,'giant bone',5)],shop:null},
  storm_ridge:         {zone:'FROSTHEIM TRAIL',name:'Storm Ridge',desc:'The final exposed ridge. Wind is intermittent — calm, then a gust requiring bracing. To the north: Frostheim on the plateau. To the south: the full sweep of everything you crossed to get here. A stone shelter offers brief refuge.',exits:{south:'ice_pass',north:'frostheim_approach',up:'sky_realm'},base:[],mon:[M('frost_giant','Frost Giant',105,16,6,360,82,'giant bone',5),M('snow_wraith','Snow Wraith',55,13,2,140,30,'ghost essence',9)],shop:null},
  frostheim_approach:  {zone:'FROSTHEIM TRAIL',name:'Frostheim Gate Road',desc:"The plateau opens and the trail becomes a stone-paved road. Frostheim is ahead — heavy timber and stone buildings, forge smoke, the great hall roof the largest structure. A Norse gate guard watches your approach with professional disinterest.",exits:{south:'storm_ridge',north:'frostheim_square'},base:[],mon:[],shop:null},
  // ── Frostheim Town ────────────────────────────────────────────────────────
  frostheim_square:    {zone:'FROSTHEIM',name:'The Thing',desc:"Frostheim's gathering square. A carved post hung with jarls' shields stands at the centre. Traders to the east, the mead hall north, the rune temple west. The Norse gate guard watches the plateau road south.",exits:{south:'frostheim_approach',north:'mead_hall',east:'frostheim_market',west:'rune_temple'},base:[],mon:[],shop:null},
  mead_hall:           {zone:'FROSTHEIM',name:"Jarl Bjorn's Mead Hall",desc:'The great hall of Frostheim — stone base, heavy timber walls, forty-year turf roof. Long tables, a fire trench, trophy walls. Jarl Bjorn sits at the high table. At the far end of the long table, Gunnar Ironside has a Hnefatafl board set up and a horn of mead that never seems to empty. The mead is exceptional. A side door east leads to the Hnefatafl hall.',exits:{south:'frostheim_square',east:'hnefatafl_hall'},base:[],mon:[],shop:null,inn:true},
  hnefatafl_hall:      {zone:'FROSTHEIM',name:'The Hnefatafl Hall',desc:"A quiet side chamber hung with carved game boards. Leif the Unbeaten sits at a board already set up and waiting. He has never lost. The record on the wall confirms this with dates going back thirty years.",exits:{west:'mead_hall'},base:[],mon:[],shop:null},
  frostheim_market:    {zone:'FROSTHEIM',name:"Freya's Trading Post",desc:"The eastern market building. Freya Stonehand manages practical stock — cold-weather supplies, potions, tools. Her prices are fixed. She does not argue them. The forge is further east.",exits:{west:'frostheim_square',east:'frostheim_smith'},base:[],mon:[],shop:'frostheim_market'},
  frostheim_smith:     {zone:'FROSTHEIM',name:"Sigrid's Forge",desc:"Sigrid's forge is the hottest building in Frostheim and the loudest. Norse weapons and armor in the Norse tradition hang cooling on the walls. Better than anything south of the mountains.",exits:{west:'frostheim_market',east:'frostheim_armory'},base:[],mon:[],shop:'frostheim_smith'},
  frostheim_armory:    {zone:'FROSTHEIM',name:'The Frostheim Armory',desc:"Heavier pieces for serious fighters. Berserker Blade, Thunder Maul, Frost Plate, Bearskin Cloak. Payment on the honor system — the iron chest by the door. Sigrid's forge is next door.",exits:{west:'frostheim_smith'},base:[],mon:[],shop:'frostheim_armory'},
  rune_temple:         {zone:'FROSTHEIM',name:'Temple of the Norns',desc:"Older than the settlement itself. Völva tends three fires that burn without fuel and a scrying pool that shows useful or disturbing things, depending. Every wall is carved runes. The stone is warm to the touch.",exits:{east:'frostheim_square',north:'frozen_docks'},base:[],mon:[],shop:'volva_potions'},
  frozen_docks:        {zone:'FROSTHEIM',name:'Frozen Docks',desc:"A frozen mountain lake. Three longships are locked in the ice, hulls wrapped in sealskin, dragon heads removed for winter. On clear nights with the settlement lights behind you and mountains on three sides, this is one of the finest views in the realm. A steep trail climbs up into the frozen tundra beyond.",exits:{south:'rune_temple',up:'frozen_tundra'},base:['ice shard'],mon:[],shop:null},
  // Forest
  ashwood_edge:    {zone:'ASHWOOD FOREST',name:'Ashwood Edge',desc:'Pale ash-barked trees. Grey light. Wolves howl in the fog. To the west, through the mist, a half-submerged stone sanctuary crumbles at the waterline.',exits:{north:'south_gate',south:'ashwood_deep',east:'forest_camp',west:'drowned_sanctuary_shore'},base:['swamp herb'],mon:[M('timber_wolf','Timber Wolf',12,4,1,25,4,'cave moss')],shop:null},
  forest_camp:     {zone:'ASHWOOD FOREST',name:"Ranger's Camp",desc:'A cold campsite of a ranger who never returned.',exits:{west:'ashwood_edge'},base:["ranger's bow",'forest cloak'],mon:[],shop:null},
  ashwood_deep:    {zone:'ASHWOOD FOREST',name:'Deep Ashwood',desc:"Trees press close. Something large moves between the trunks. A worn path — the King's Road — winds east toward Ashford Village.",exits:{north:'ashwood_edge',south:'swamp_border',west:'forest_ruins',east:'trail_crossroads'},base:[],mon:[M('forest_troll','Forest Troll',28,7,2,60,12,'troll hide'),M('timber_wolf2','Timber Wolf',12,4,1,25,4,'cave moss')],shop:null},
  forest_ruins:    {zone:'ASHWOOD FOREST',name:'Forest Ruins',desc:'Ancient moss-draped walls. An altar glints with forgotten treasure.',exits:{east:'ashwood_deep'},base:['enchanted gem','ancient rune'],mon:[M('stone_golem','Stone Golem',35,8,4,90,20,'obsidian shard')],shop:null},
  swamp_border:    {zone:'ASHWOOD FOREST',name:'Swamp Border',desc:'The floor gives way to brackish water. Serpents sun on logs.',exits:{north:'ashwood_deep',south:'swamp_heart'},base:['swamp herb'],mon:[M('swamp_serpent','Swamp Serpent',20,6,1,40,8,'serpent fang')],shop:null},
  swamp_heart:     {zone:'ASHWOOD FOREST',name:'Heart of the Swamp',desc:'A small island of dry ground in the bog. A ruined watchtower sinks into the mire. Rare deepwood roots grow here. The ground here is unnaturally dark — a tear in reality pulses beneath the roots.',exits:{north:'swamp_border',down:'shadow_realm'},base:['obsidian shard','deepwood root'],mon:[M('bog_witch','Bog Witch',32,9,2,85,22,'void crystal')],shop:null},
  // Dungeon Upper
  // ── ASHFORD VILLAGE (second town, reachable through the forest) ────────────
  ashford_gate:    {zone:'ASHFORD VILLAGE',name:'Ashford Gate',desc:"A stout timber gate marks the western edge of Ashford Village, the far end of the King's Road through the Ashwood Forest. Survivors of the old war built this place with hard hands. The village square lies north, the road west leads back through the trail.",exits:{north:'ashford_square',west:'trail_fields'},base:[],mon:[],shop:null},
  ashford_square:  {zone:'ASHFORD VILLAGE',name:'Ashford Square',desc:'A muddy square with a well at its centre. Villagers eye strangers with practiced suspicion. The market row stretches east, the Rusted Nail inn to the west (Oswin sits outside it at his chess table), the healer to the north, the gate south. An ancient shrine stands at the far end of the square.',exits:{south:'ashford_gate',east:'ashford_market_row',west:'ashford_inn_yard',north:'ashford_healer',up:'ashford_shrine'},base:[],mon:[],shop:null},
  ashford_inn_yard:{zone:'ASHFORD VILLAGE',name:'Outside the Rusted Nail',desc:"A worn bench and heavy oak table sit against the front wall of the Rusted Nail inn. Oswin — a former court strategist, grey-cloaked, unhurried — has a chess board set up and waiting. He plays here every day. He is very good. The square lies east, the inn door west.",exits:{east:'ashford_square',west:'ashford_inn'},base:[],mon:[],shop:null},
  ashford_shrine:  {zone:'ASHFORD VILLAGE',name:"The Wayfarer's Shrine",desc:"Far older than the village around it. The standing stones are carved with runes no living scholar can fully translate. A cloaked figure called the Wayfarer tends the shrine, whispering to the stones.",exits:{down:'ashford_square'},base:[],mon:[],shop:null,teleport:'ashford'},
  ashford_store:   {zone:'ASHFORD VILLAGE',name:'Martas General Store',desc:'Cluttered shelves of practical goods. Marta watches you with sharp eyes.',exits:{west:'ashford_market_row',east:'ashford_outskirts'},base:[],mon:[],shop:'ashford_store'},
  ashford_inn:     {zone:'ASHFORD VILLAGE',name:'The Rusted Nail Inn',desc:'A low-ceilinged inn smelling of woodsmoke. Old Barret the innkeeper nods from behind the bar. Rooms available for weary travellers. Oswin is outside at his chess table to the east.',exits:{east:'ashford_inn_yard'},base:[],mon:[],shop:null,inn:true},
  ashford_healer:  {zone:'ASHFORD VILLAGE',name:'Ashford Healing Post',desc:'A clean whitewashed room. Brother Finn, a gentle monk, tends a patient. Healing herbs hang drying from the rafters.',exits:{south:'ashford_square'},base:['swamp herb'],mon:[],shop:'ashford_healer'},
  ashford_outskirts:{zone:'ASHFORD VILLAGE',name:'Ashford Outskirts',desc:'Ruined buildings mark where the village once extended. Bandits have moved in. The road east leads deeper into dangerous territory. The Frontier Guard outpost is north.',exits:{west:'ashford_store',east:'bandit_camp',north:'guild_outpost'},base:[],mon:[{id:'ashford_bandit',name:'Bandit Scout',hp:22,maxhp:22,atk:6,def:2,agi:4,xp:45,gold:15,loot:'crude map',dead:false}],shop:null},
  bandit_camp:     {zone:'ASHFORD VILLAGE',name:'Bandit Camp',desc:'A fortified camp of outlaws. The Bandit King rules from his throne of stolen goods.',exits:{west:'ashford_outskirts'},base:['obsidian shard','gold coin'],mon:[{id:'bandit_thug','name':'Bandit Thug',hp:30,maxhp:30,atk:8,def:3,agi:5,xp:65,gold:20,loot:'iron key',dead:false},{id:'bandit_king',name:'Bandit King',hp:70,maxhp:70,atk:14,def:5,agi:9,xp:300,gold:80,loot:"Bandit King's Blade",dead:false}],shop:null},
  // ── Ashford Expansion ─────────────────────────────────────────────────────
  ashford_market_row:{zone:'ASHFORD VILLAGE',name:'Ashford Market Row',desc:"A lane of specialist shops running east from the square. The general store is east, Torvar's smithy north, Sister Maren's apothecary south. Commerce thrives despite the frontier.",exits:{west:'ashford_square',east:'ashford_store',north:'the_crucible',south:'deadwood_apothecary'},base:[],mon:[],shop:null},
  the_crucible:    {zone:'ASHFORD VILLAGE',name:'The Crucible',desc:'A working smithy hotter than summer. Torvar, a scarred half-orc blacksmith, pounds iron at a massive forge. Advanced weapons hang cooling on the walls. A sign reads: CRAFTING COSTS GOLD HERE.',exits:{south:'ashford_market_row',east:'arcane_vault'},base:[],mon:[],shop:'the_crucible'},
  arcane_vault:    {zone:'ASHFORD VILLAGE',name:"Elyndra's Arcane Vault",desc:"Shelves of arcane curiosities line every wall. Elyndra, a sharp-eyed elven scholar, catalogues magical items with obsessive precision. An unmarked door north leads somewhere less reputable.",exits:{west:'the_crucible',north:'shadow_market_ashford'},base:[],mon:[],shop:'arcane_vault'},
  shadow_market_ashford:{zone:'ASHFORD VILLAGE',name:'The Shadow Market',desc:'A dimly lit back room behind an unmarked door. Vex — a wiry half-elf with quick fingers and no last name — sits surrounded by goods of questionable origin.',exits:{south:'arcane_vault'},base:[],mon:[],shop:'shadow_market_ashford'},
  deadwood_apothecary:{zone:'ASHFORD VILLAGE',name:"Sister Maren's Apothecary",desc:"A clean apothecary fragrant with dried herbs and something sharper. Sister Maren, a pale woman in healer's robes, works at her bench grinding rare components. More advanced compounds than Shadowmere.",exits:{north:'ashford_market_row'},base:['deepwood root'],mon:[],shop:'deadwood_apothecary'},
  guild_outpost:   {zone:'ASHFORD VILLAGE',name:'Ashford Guild Outpost',desc:"A fortified building bearing the Frontier Guard sigil. Captain Holt stands at a map table, tracking bandit movements with iron pins. Veterans drill in the yard outside.",exits:{south:'ashford_outskirts'},base:[],mon:[],shop:null},
  // ── King's Road Trail (10 main rooms) ────────────────────────────────────
  trail_crossroads:{zone:"KING'S ROAD",name:'Trail Crossroads',desc:"A worn fork in the Ashwood path. The King's Road continues east toward Ashford Village. A boggy side-track leads south into darker undergrowth. A traveller's cairn marks the junction.",exits:{west:'ashwood_deep',east:'trail_ravine_path',south:'bog_track_1'},base:['torch'],mon:[M('trail_wolf','Trail Wolf',18,5,1,35,7,'cave moss'),M('trail_bandit','Trail Bandit',22,6,2,45,12,'crude map')],shop:null},
  trail_ravine_path:{zone:"KING'S ROAD",name:'Ravine Path',desc:'The road hugs the edge of a narrow ravine. Loose shale crumbles at the verge. A side ledge descends east into the ravine proper.',exits:{west:'trail_crossroads',east:'trail_hillcrest',south:'ravine_descent'},base:[],mon:[M('cave_bat','Cave Bat',14,4,0,28,5,'bat wing'),M('large_spider','Large Spider',20,6,1,38,8,'spider silk')],shop:null},
  trail_hillcrest: {zone:"KING'S ROAD",name:'Highland Crest',desc:"The road crests a low hill. Views of the forest canopy stretch west; smoke from Ashford's chimneys visible far east. Ancient barrow mounds line the northern ridge.",exits:{west:'trail_ravine_path',east:'trail_old_camp',north:'barrow_mound'},base:['ancient rune'],mon:[M('highland_wolf','Highland Wolf',25,7,2,50,10,'cave moss'),M('stone_crow','Stone Crow',16,5,0,30,6,'storm feather')],shop:null},
  trail_old_camp:  {zone:"KING'S ROAD",name:'Old Waycamp',desc:'Remains of a soldier waycamp — cold fire pit, rusted stakes, rotted canvas. Someone has been here recently. An overgrown path leads north into the trees.',exits:{west:'trail_hillcrest',east:'trail_valley',north:'bandit_hideout'},base:['torch','iron key'],mon:[M('deserter_soldier','Deserter Soldier',28,7,3,55,14,'bone shard'),M('pack_rat','Pack Rat',10,3,0,20,4,'rat tail')],shop:null},
  trail_valley:    {zone:"KING'S ROAD",name:'Valley Floor',desc:'The road dips into a mist-filled valley. A stream cuts across the path. Giant boars root in the undergrowth. The burned hamlet is visible to the east.',exits:{west:'trail_old_camp',east:'trail_burned_hamlet'},base:['swamp herb'],mon:[M('giant_boar','Giant Boar',32,8,3,65,15,'boar tusk'),M('forest_bandit','Forest Bandit',26,7,2,52,13,'crude map')],shop:null},
  trail_burned_hamlet:{zone:"KING'S ROAD",name:'Burned Hamlet',desc:'The charred remains of a small hamlet. Three scorched foundations and a crumbled well. A lone woman sits among the ruins. Plague ghouls stir in the ash.',exits:{west:'trail_valley',east:'trail_stone_bridge'},base:['ghost essence'],mon:[M('plague_ghoul','Plague Ghoul',30,8,1,60,12,'grave dust')],shop:null},
  trail_stone_bridge:{zone:"KING'S ROAD",name:'Stone Bridge',desc:'A moss-covered stone arch bridge over a dark river. River trolls lurk beneath. The road continues east onto firmer ground.',exits:{west:'trail_burned_hamlet',east:'trail_overgrown_road'},base:[],mon:[M('river_troll','River Troll',38,9,3,78,18,'troll hide'),M('water_serpent','Water Serpent',22,6,1,42,9,'serpent fang')],shop:null},
  trail_overgrown_road:{zone:"KING'S ROAD",name:'Overgrown Road',desc:'Once a proper road, now reclaimed by vines and brambles. Vine-wrapped stone constructs patrol like slow sentinels.',exits:{west:'trail_stone_bridge',east:'trail_watchtower'},base:['forest cloak'],mon:[M('vine_golem','Vine Golem',35,8,4,72,16,'ancient rune'),M('assassin_vine','Assassin Vine',18,7,0,38,8,'swamp herb')],shop:null},
  trail_watchtower:{zone:"KING'S ROAD",name:'Ruined Watchtower',desc:'A crumbling watchtower at a bend in the road. Gargoyle sentinels perch on the broken rim. The smoke of Ashford is visible east. Climbing to the top of the tower reveals a blasted industrial wasteland stretching north above the treeline.',exits:{west:'trail_overgrown_road',east:'trail_fields',up:'iron_wastes'},base:['obsidian shard'],mon:[M('gargoyle_sentinel','Gargoyle Sentinel',40,10,4,88,20,'obsidian shard'),M('tower_wraith','Tower Wraith',28,8,1,56,12,'ghost essence')],shop:null},
  trail_fields:    {zone:"KING'S ROAD",name:"King's Road Fields",desc:"Open farmland marks Ashford's territory. The village gate is east. Ruins of an old farmstead lie south. The King's Road ends here.",exits:{west:'trail_watchtower',east:'ashford_gate',south:'farmstead_gate'},base:['swamp herb','torch'],mon:[M('scarecrow_horror','Scarecrow Horror',24,7,1,50,10,'grave dust'),M('grain_toad','Grain Toad',16,5,0,32,7,'swamp herb')],shop:null},
  // ── Branch 1: Bogwood Trail (off trail_crossroads south) ─────────────────
  bog_track_1:     {zone:'BOGWOOD TRAIL',name:'Bogwood Track',desc:'A muddy track cuts south into fetid bog. Croaking frogs and distant splashes. Cultist markings on the trees.',exits:{north:'trail_crossroads',south:'bog_track_2'},base:['swamp herb'],mon:[M('bog_frog','Bog Frog',16,5,0,30,6,'swamp herb'),M('mud_lurker','Mud Lurker',22,6,1,44,10,'cave moss')],shop:null},
  bog_track_2:     {zone:'BOGWOOD TRAIL',name:'Bogwood Depths',desc:'Knee-deep water covers the path. Twisted trees draped in moss. Void symbols carved into the trunks.',exits:{north:'bog_track_1',south:'bog_shrine'},base:['void crystal'],mon:[M('swamp_cultist2','Swamp Cultist',28,7,2,58,14,'void crystal'),M('bog_frog2','Bog Frog',16,5,0,30,6,'swamp herb')],shop:null},
  bog_shrine:      {zone:'BOGWOOD TRAIL',name:'Sunken Shrine',desc:'A half-submerged stone shrine to a forgotten water deity. Dark offerings float on the surface. A cave opens south.',exits:{north:'bog_track_2',south:'bog_cave'},base:['ancient rune','void crystal'],mon:[M('shrine_guardian','Shrine Guardian',38,9,3,80,18,'ancient rune')],shop:null},
  bog_cave:        {zone:'BOGWOOD TRAIL',name:"Bog Horror's Lair",desc:'A vile cave of dripping black walls and fetid water. The Bog Horror — an immense creature of mud and rot — lurks here. The cave floor is submerged — a passage leads down into a vast drowned city below.',exits:{north:'bog_shrine',down:'necropolis_gate'},base:['obsidian shard','deepwood root'],mon:[M('bog_horror','Bog Horror',65,13,4,220,45,'deepwood root')],shop:null},
  // ── Branch 2: The Ravine (off trail_ravine_path south) ──────────────────
  ravine_descent:  {zone:'THE RAVINE',name:'Ravine Descent',desc:'A steep switchback path descends into the ravine. Cave spiders nest in every crevice.',exits:{north:'trail_ravine_path',south:'ravine_floor'},base:[],mon:[M('cave_spider','Cave Spider',20,6,1,38,8,'spider silk'),M('rock_crawler','Rock Crawler',18,5,2,36,8,'cave moss')],shop:null},
  ravine_floor:    {zone:'THE RAVINE',name:'Ravine Floor',desc:'The bottom of the ravine — a stream-cut channel of smooth stone. Bioluminescent fungi light the walls in cold blue.',exits:{north:'ravine_descent',south:'ravine_grotto'},base:['enchanted gem'],mon:[M('ravine_serpent','Ravine Serpent',32,8,2,65,14,'serpent fang'),M('cave_spider2','Cave Spider',20,6,1,38,8,'spider silk')],shop:null},
  ravine_grotto:   {zone:'THE RAVINE',name:'Crystal Grotto',desc:'A hidden cave of crystal formations, water dripping into a clear pool. Ancient coins gleam on the bottom.',exits:{north:'ravine_floor',south:'ravine_crevasse'},base:['enchanted gem','old coin'],mon:[M('crystal_beetle','Crystal Beetle',26,7,3,52,12,'prismatic shard')],shop:null},
  ravine_crevasse: {zone:'THE RAVINE',name:'The Deep Crevasse',desc:'The ravine narrows to a crack in the earth. The Stone Leviathan — ancient guardian of the depths — coils in the darkness below. Crystal light glimmers from even deeper below.',exits:{north:'ravine_grotto',down:'crystal_caverns'},base:['obsidian shard','prismatic shard'],mon:[M('stone_leviathan','Stone Leviathan',80,14,6,280,55,'obsidian shard')],shop:null},
  // ── Branch 3: Hill Barrows (off trail_hillcrest north) ───────────────────
  barrow_mound:    {zone:'HILL BARROWS',name:'Barrow Mounds',desc:'Ancient burial mounds cover the hillside. Disturbed earth and broken stones. An entrance to an underground hall is visible.',exits:{south:'trail_hillcrest',north:'barrow_entrance'},base:['grave dust'],mon:[M('barrow_wight','Barrow Wight',30,8,2,62,13,'grave dust'),M('grave_robber','Grave Robber',24,6,2,48,12,'iron key')],shop:null},
  barrow_entrance: {zone:'HILL BARROWS',name:'Barrow Hall',desc:'A low stone hall, walls carved with the deeds of a forgotten king. Tomb guardians stand at attention in the shadows.',exits:{south:'barrow_mound',north:'barrow_vault'},base:['ancient rune','bone shard'],mon:[M('tomb_guardian','Tomb Guardian',42,10,4,92,20,'enchanted gem'),M('barrow_wight2','Barrow Wight',30,8,2,62,13,'grave dust')],shop:null},
  barrow_vault:    {zone:'HILL BARROWS',name:'The Treasure Vault',desc:"A vaulted chamber of interred wealth — grave goods of a line of chieftains. A tarnished locket lies among the offerings. The Barrow King's presence is palpable.",exits:{south:'barrow_entrance',north:'barrow_depths'},base:["nessa's locket",'old coin','enchanted gem'],mon:[M('barrow_skeleton','Barrow Skeleton',35,9,3,72,16,'bone shard')],shop:null},
  barrow_depths:   {zone:'HILL BARROWS',name:"Barrow King's Rest",desc:'A throne room below the earth. The Barrow King — an ancient undead warrior in burial plate — rises from his throne. A collapsed passage above connects to a far older structure beyond.',exits:{south:'barrow_vault',up:'haunted_keep'},base:['void crystal'],mon:[M('barrow_king','Barrow King',90,15,6,320,65,"barrow king's crown")],shop:null},
  // ── Branch 4: Bandit Hideout (off trail_old_camp north) ──────────────────
  bandit_hideout:  {zone:'BANDIT HIDEOUT',name:'Bandit Outpost',desc:'A fortified outpost of the Ashwood bandits. Sharpened stakes, a crude watchtower. Armed sentinels at every entrance.',exits:{south:'trail_old_camp',north:'bandit_armory_trail'},base:['crude map','torch'],mon:[M('bandit_cutthroat','Bandit Cutthroat',26,7,2,52,13,'crude map'),M('bandit_sharpshooter','Bandit Sharpshooter',22,8,1,46,12,"ranger's bow")],shop:null},
  bandit_armory_trail:{zone:'BANDIT HIDEOUT',name:'Bandit Armory',desc:'A stocked armoury of stolen goods and crude weapons. An enforcer guards the door to the inner sanctum.',exits:{south:'bandit_hideout',north:'bandit_vault_trail'},base:['iron key','bone shard'],mon:[M('bandit_enforcer','Bandit Enforcer',40,10,3,88,20,'Iron Sword')],shop:null},
  bandit_vault_trail:{zone:'BANDIT HIDEOUT',name:'Plunder Vault',desc:'A cave stacked with stolen goods, coin sacks, and confiscated weapons. A passage north leads to the captain.',exits:{south:'bandit_armory_trail',north:'bandit_captain_den'},base:['old coin','obsidian shard'],mon:[M('bandit_vault_guard','Bandit Guard',30,8,3,62,15,'crude map')],shop:null},
  bandit_captain_den:{zone:'BANDIT HIDEOUT',name:"Road Captain's Den",desc:"The trail's bandit captain holds court here. Wanted posters cover the walls. A stolen ledger sits on the table.",exits:{south:'bandit_vault_trail'},base:['stolen ledger','crude map'],mon:[M('road_captain','Road Captain',70,13,5,250,50,"road captain's badge")],shop:null},
  // ── Branch 5: Farmstead Ruins (off trail_fields south) ───────────────────
  farmstead_gate:  {zone:'FARMSTEAD RUINS',name:'Farmstead Gate',desc:'A rusted iron gate marks an abandoned farmstead. The fields are overgrown, the buildings collapsed. Shades drift between the ruins.',exits:{north:'trail_fields',south:'farmstead_yard'},base:['grave dust'],mon:[M('farmstead_shade','Farmstead Shade',28,7,1,56,11,'ghost essence'),M('grave_pest','Grave Pest',14,4,0,26,5,'rat tail')],shop:null},
  farmstead_yard:  {zone:'FARMSTEAD RUINS',name:'Farmstead Yard',desc:'The main yard — a collapsed barn to the west, a silo east, the farmhouse ahead. Animated ploughs and rakes clatter about on their own.',exits:{north:'farmstead_gate',south:'farmstead_cellar',east:'farmstead_silo'},base:['swamp herb'],mon:[M('animated_plough','Animated Plough',20,6,2,40,9,'bone shard'),M('farmstead_shade2','Farmstead Shade',28,7,1,56,11,'ghost essence')],shop:null},
  farmstead_silo:  {zone:'FARMSTEAD RUINS',name:'The Old Silo',desc:'A grain silo infested with giant rats and cave toads. The upper level holds a locked chest.',exits:{west:'farmstead_yard'},base:['obsidian shard'],mon:[M('silo_rat','Silo Rat',18,5,0,34,7,'rat tail'),M('cave_toad','Cave Toad',24,6,1,46,9,'swamp herb')],shop:null},
  farmstead_cellar:{zone:'FARMSTEAD RUINS',name:'Farmstead Cellar',desc:'The farmhouse cellar — preserved despite the ruin above. Wine racks, root barrels. A farmstead wraith guards the original owners valuables.',exits:{north:'farmstead_yard'},base:['ancient rune','enchanted gem'],mon:[M('farmstead_wraith','Farmstead Wraith',60,12,3,200,40,'void crystal')],shop:null},
  dungeon_entrance:{zone:'THE DUNGEON — UPPER',name:'Dungeon Entrance',desc:'Iron-banded doors hang open above a descending staircase.',exits:{up:'south_gate',down:'dungeon_hall'},base:[],mon:[],shop:null},
  dungeon_hall:    {zone:'THE DUNGEON — UPPER',name:'Dungeon Hall',desc:"A vaulted corridor. Torches sputter. Aldwyn's satchel lies near the wall.",exits:{up:'dungeon_entrance',east:'crypts',west:'prison',north:'dungeon_armory',south:'dungeon_well'},base:["Aldwyn's satchel"],mon:[M('skel_warrior','Skeleton Warrior',18,5,1,35,6,'bone shard')],shop:null},
  dungeon_armory:  {zone:'THE DUNGEON — UPPER',name:'Dungeon Armory',desc:'Racks of rotted wood. One intact chest, lock smashed.',exits:{south:'dungeon_hall',north:'mid_dungeon'},base:['iron key','bone shard'],mon:[M('armor_skel','Armored Skeleton',22,6,3,50,10,'bone shard')],shop:null},
  dungeon_well:    {zone:'THE DUNGEON — UPPER',name:'The Stagnant Well',desc:'Murals depict a dark ritual — the raising of something terrible.',exits:{north:'dungeon_hall'},base:['ancient rune'],mon:[M('risen_cultist','Risen Cultist',16,5,1,30,7,'cultist robe')],shop:null},
  crypts:          {zone:'THE DUNGEON — UPPER',name:'Ancient Crypts',desc:'Row upon row of sarcophagi. Several lids pushed aside from within.',exits:{west:'dungeon_hall',north:'crypt_deep'},base:['silver ring'],mon:[M('risen_corpse','Risen Corpse',20,5,2,45,8,'grave dust')],shop:null},
  crypt_deep:      {zone:'THE DUNGEON — UPPER',name:'The Sealed Vault',desc:'An iron door blasted open from inside. A sarcophagus glows blue.',exits:{south:'crypts'},base:['void crystal'],mon:[M('crypt_lich','Crypt Lich',30,8,3,100,25,'enchanted gem')],shop:null},
  prison:          {zone:'THE DUNGEON — UPPER',name:'Prison Block',desc:'Rusted iron cells. A skeleton clutches a ring of keys.',exits:{east:'dungeon_hall'},base:[],mon:[M('ghost_guard','Prison Guard Ghost',14,4,0,30,7,'ghost essence')],shop:null},
  temple_crypt:    {zone:'THE DUNGEON — UPPER',name:'Temple Crypt',desc:'A forgotten burial crypt. Ancient runes are carved into the walls.',exits:{north:'temple',south:'mid_dungeon',down:'mid_dungeon'},base:['ancient rune'],mon:[M('corrupt_priest','Corrupt Priest',24,6,2,55,12,'void crystal')],shop:null},
  // Dungeon Lower
  mid_dungeon:     {zone:'THE DUNGEON — LOWER',name:'The Descent',desc:'The corridor narrows. Stone older than memory. The cold is profound.',exits:{north:'dungeon_armory',south:'boss_antechamber',east:'dragon_lair',west:'void_temple',up:'temple_crypt'},base:[],mon:[M('shadow_wraith','Shadow Wraith',30,8,2,75,15,'void crystal')],shop:null},
  dragon_lair:     {zone:'THE DUNGEON — LOWER',name:"Dragon's Lair",desc:'A vast scorched cavern. A young dragon fixes burning eyes on you.',exits:{west:'mid_dungeon'},base:['dragon scale'],mon:[M('young_dragon','Young Dragon',55,12,5,180,60,'dragon scale')],shop:null},
  void_temple:     {zone:'THE DUNGEON — LOWER',name:'Void Temple',desc:'Cultists chant before an altar pulsing with violet energy. The altar itself is a gateway — the void energy below the stone forms a passage between planes.',exits:{east:'mid_dungeon',down:'astral_sea'},base:['void crystal','ancient tome'],mon:[M('void_cultist','Void Cultist',25,7,2,60,14,'cultist robe'),M('void_archon','Void Archon',38,10,3,110,28,'void crystal')],shop:null},
  boss_antechamber:{zone:'THE DUNGEON — LOWER',name:'Antechamber of the Lich',desc:'Skeletal soldiers at attention. A black iron door looms north. The passage south leads back to the Descent.',exits:{north:'boss_chamber',south:'mid_dungeon'},base:[],mon:[M('lich_champion',"Lich's Champion",45,11,4,150,35,'enchanted gem')],shop:null},
  boss_chamber:    {zone:'THE DUNGEON — LOWER',name:"The Lich's Chamber",desc:'Arcane sigils burn in cold blue fire. Upon a throne of bones sits the Dungeon Lich. A trapdoor in the floor is sealed with void runes — beyond it lies something older than the dungeon itself.',exits:{south:'boss_antechamber',down:'void_sanctum'},base:[],mon:[M('dungeon_lich','Dungeon Lich',80,14,5,500,100,"Lich's Crown")],shop:null},
  // Adventure zones
  volcanic_peak:   {zone:'VOLCANIC PEAK',name:'Crater Rim',desc:'Scorched black rock. Lava rivers below. Fire elementals patrol the ridge. A mine fissure leads up into the deep rock.',exits:{south:'volcanic_tunnels',east:'volcanic_ridge',west:'lava_fields',north:'crater_overlook',up:'silver_lode'},base:['obsidian shard'],mon:[M('fire_elem','Fire Elemental',80,10,3,110,20,'ember shard'),M('lava_golem','Lava Golem',110,13,5,160,30,'magma core')],shop:null},
  volcanic_tunnels:{zone:'VOLCANIC PEAK',name:'Superheated Tunnels',desc:'Lava-carved tunnels. Strange runes glow on the walls.',exits:{north:'volcanic_peak',south:'volcano_boss',west:'sulfur_vents'},base:['magma core'],mon:[M('fire_imp','Fire Imp',50,7,1,60,12,'ember shard'),M('rock_wyrm','Rock Wyrm',90,11,4,130,25,'wyrm scale')],shop:null},
  volcano_boss:    {zone:'VOLCANIC PEAK',name:'The Magma Throne',desc:'The Flame Titan stirs — a fusion of molten rock and fury.',exits:{north:'volcanic_tunnels'},base:[],mon:[M('flame_titan','Flame Titan',240,18,6,800,150,"Titan's Core")],shop:null},
  frozen_tundra:   {zone:'FROZEN TUNDRA',name:'Ice Plains',desc:'A blinding white expanse. Frost wolves circle at the edges of vision. The sheltered docks of Frostheim lie to the south.',exits:{north:'ice_fortress',east:'frozen_cave',west:'glacier_edge',south:'snowdrift_hollow',down:'frozen_docks'},base:['ice shard'],mon:[M('frost_wolf','Frost Wolf',56,7,2,55,10,'frost pelt'),M('ice_wraith','Ice Wraith',70,9,1,80,15,'ghost essence')],shop:null},
  frozen_cave:     {zone:'FROZEN TUNDRA',name:'Frozen Cave',desc:'Blue-white ice. Something massive hibernates at the back.',exits:{west:'frozen_tundra',north:'ice_labyrinth'},base:['ice crystal'],mon:[M('yeti','Yeti',110,12,4,170,35,'yeti fur'),M('ice_golem','Ice Shard Golem',80,9,6,120,22,'ice shard')],shop:null},
  ice_fortress:    {zone:'FROZEN TUNDRA',name:'Ice Fortress Gates',desc:"The Frost Queen's banner hangs frozen above the arch.",exits:{south:'frozen_tundra',north:'frost_throne',east:'frozen_barracks'},base:[],mon:[M('frost_knight','Frost Knight',100,13,5,200,40,'frost blade')],shop:null},
  frost_throne:    {zone:'FROZEN TUNDRA',name:'The Frost Throne',desc:'The Frost Queen sits encased in living ice, eyes burning pale blue.',exits:{south:'ice_fortress'},base:[],mon:[M('frost_queen','Frost Queen',220,16,7,900,200,"Frost Queen's Crown")],shop:null},
  sky_realm:       {zone:'SKY REALM',name:'Cloud Platform',desc:'Floating platforms of condensed cloud. Wind spirits drift between. Far below through the cloud breaks, the Storm Ridge peak is visible.',exits:{east:'storm_citadel',west:'sky_ruins',north:'upper_winds',south:'cloud_maze',down:'storm_ridge'},base:['cloud essence'],mon:[M('wind_spirit','Wind Spirit',60,8,2,70,18,'wind shard'),M('thunder_hawk','Thunder Hawk',76,11,2,100,22,'storm feather')],shop:null},
  sky_ruins:       {zone:'SKY REALM',name:'Fallen Sky Ruins',desc:'Ancient ruins suspended in the sky. Stone arches float in defiance of gravity.',exits:{east:'sky_realm',west:'ruined_observatory',north:'floating_garden'},base:['ancient rune','storm feather'],mon:[M('stone_sentinel','Stone Sentinel',100,12,5,180,35,'enchanted gem')],shop:null},
  storm_citadel:   {zone:'SKY REALM',name:'Storm Citadel',desc:'The Storm God regards you with contempt.',exits:{west:'sky_realm'},base:[],mon:[M('storm_god','Storm God',260,20,5,1000,250,"Storm God's Aegis")],shop:null},
  shadow_realm:    {zone:'SHADOW REALM',name:'The Threshold',desc:'Reality tears. Shadow demons emerge from the walls themselves. A sliver of dim swamp light bleeds upward through a tear in the ground.',exits:{north:'void_citadel',east:'nightmare_forest',south:'shadow_swamp',west:'void_wastes',up:'swamp_heart'},base:['void crystal'],mon:[M('shadow_demon','Shadow Demon',90,12,3,150,30,'shadow essence'),M('nightmare_hound','Nightmare Hound',70,10,2,100,20,'nightmare fang')],shop:null},
  nightmare_forest:{zone:'SHADOW REALM',name:'Nightmare Forest',desc:'Black leafless trees. Shadows move independently. Screams echo without source.',exits:{west:'shadow_realm',north:'screaming_grove',south:'fear_cavern'},base:['shadow essence'],mon:[M('banshee','Banshee',80,11,1,130,25,'spectral dust'),M('dark_treant','Dark Treant',120,14,4,220,45,'shadow bark')],shop:null},
  void_citadel:    {zone:'SHADOW REALM',name:'Void Citadel',desc:'The Void Emperor sits on a throne of crystallised darkness.',exits:{south:'shadow_realm',east:'citadel_ramparts'},base:[],mon:[M('void_emperor','Void Emperor',300,22,7,1200,300,"Void Emperor's Sigil")],shop:null},
  crystal_caverns: {zone:'CRYSTAL CAVERNS',name:'Crystal Caverns',desc:'Towering luminescent crystal formations. Crystal golems patrol the paths. A narrow crevasse above leads back toward the ravine.',exits:{north:'crystal_depths',east:'gem_vault',south:'crystal_foyer',west:'luminite_passage',up:'ravine_crevasse'},base:['enchanted gem'],mon:[M('crystal_golem','Crystal Golem',140,16,8,280,55,'prismatic shard'),M('gem_spider','Gem Spider',100,13,4,180,35,'spider gem')],shop:null},
  gem_vault:       {zone:'CRYSTAL CAVERNS',name:'The Gem Vault',desc:'A natural vault packed with raw gemstones.',exits:{west:'crystal_caverns',north:'vault_corridor',east:'diamond_mines'},base:['prismatic shard','void crystal'],mon:[M('diamond_guardian','Diamond Guardian',170,18,10,350,70,'diamond core')],shop:null},
  crystal_depths:  {zone:'CRYSTAL CAVERNS',name:'Crystalline Depths',desc:'The Prism Titan — ancient guardian of the caverns — rises from the floor. The resonance chamber lies deeper north.',exits:{south:'crystal_caverns',north:'deep_resonance_chamber'},base:[],mon:[M('prism_titan','Prism Titan',320,22,9,1400,320,"Prism Titan's Core")],shop:null},
  haunted_keep:    {zone:'HAUNTED KEEP',name:'Keep Courtyard',desc:'Wailing spirits patrol the overgrown courtyard. Ancient tunnels beneath the foundations connect to the barrow network to the south.',exits:{north:'keep_great_hall',east:'keep_dungeons',west:'haunted_garden',south:'chapel_ruins',down:'barrow_depths'},base:['ghost essence'],mon:[M('wailing_specter','Wailing Specter',150,18,4,300,60,'spectral dust'),M('cursed_knight','Cursed Knight',180,21,8,380,75,'cursed blade')],shop:null},
  keep_dungeons:   {zone:'HAUNTED KEEP',name:'Keep Dungeons',desc:'The underground cells still hold their prisoners — undead ones.',exits:{west:'haunted_keep',south:'torture_chamber',east:'forgotten_wing'},base:['ancient rune'],mon:[M('chained_revenant','Chained Revenant',160,19,5,320,65,'revenant dust'),M('bone_horror','Bone Horror',190,22,6,400,80,'cursed bone')],shop:null},
  keep_great_hall: {zone:'HAUNTED KEEP',name:'The Great Hall',desc:'At the head table sits the Death Baron — lord of the keep.',exits:{south:'haunted_keep',north:'lord_chambers'},base:[],mon:[M('death_baron','Death Baron',380,25,10,1600,380,"Death Baron's Crown")],shop:null},
  astral_sea:      {zone:'ASTRAL SEA',name:'Astral Sea Shallows',desc:'An infinite ocean of silver light between the planes. A void-touched altar shimmers above — the entry point from the dungeon below.',exits:{north:'astral_depths',west:'astral_wreckage',east:'silver_current',south:'astral_shallows',up:'void_temple'},base:['cloud essence','void crystal'],mon:[M('astral_shark','Astral Shark',180,22,6,380,80,'astral fin'),M('plane_walker','Plane Walker',150,20,8,320,65,'astral essence')],shop:null},
  astral_wreckage: {zone:'ASTRAL SEA',name:'Astral Wreckage',desc:'Remains of civilisations lost between planes. Githyanki pirates board the wrecks.',exits:{east:'astral_sea',west:'wreck_field',south:'ghost_ship'},base:['enchanted gem','ancient tome'],mon:[M('githyanki','Githyanki Pirate',170,21,7,360,75,'silver sword')],shop:null},
  astral_depths:   {zone:'ASTRAL SEA',name:'The Astral Vortex',desc:'A churning vortex of planar energy. The Astral Leviathan circles endlessly.',exits:{south:'astral_sea',east:'vortex_edge'},base:[],mon:[M('astral_leviathan','Astral Leviathan',420,28,10,1800,420,"Leviathan's Scale")],shop:null},
  void_sanctum:    {zone:'VOID SANCTUM',name:'Void Sanctum Antechamber',desc:'Beyond the edges of existence. Void wraiths guard the passage. Above, faintly visible, a trapdoor leading back to the Lich\'s Chamber.',exits:{north:'sanctum_inner',east:'void_library',south:'outer_void',west:'null_corridor',up:'boss_chamber'},base:['void crystal','shadow essence'],mon:[M('void_wraith','Void Wraith',220,26,8,500,100,'void essence'),M('null_horror','Null Horror',260,28,9,600,120,'void crystal')],shop:null},
  void_library:    {zone:'VOID SANCTUM',name:'Library of the Void',desc:'Every book ever lost, consumed by the void. Scholars guard it jealously.',exits:{west:'void_sanctum',north:'forbidden_archive',east:'reading_hall'},base:['ancient tome','ancient rune'],mon:[M('void_scholar','Void Scholar',200,24,10,450,90,'forbidden tome')],shop:null},
  sanctum_inner:   {zone:'VOID SANCTUM',name:'Inner Sanctum — The Nothing',desc:'The Void God — the primordial emptiness given terrible consciousness — waits here.',exits:{south:'void_sanctum',east:'antechamber_of_void'},base:[],mon:[M('void_god','Void God',500,32,12,2500,500,"Void God's Essence")],shop:null},

  // ── VOLCANIC PEAK EXPANSION ───────────────────────────────────────────────
  volcanic_ridge:    {zone:'VOLCANIC PEAK',name:'Volcanic Ridge',desc:'A jagged spine of cooled lava rises here, offering a punishing view of the smoldering caldera below.',exits:{west:'volcanic_peak',east:'ash_canyon'},base:['ember shard'],mon:[M('fire_imp','Fire Imp',44,6,0,45,8,'ember shard')],shop:null},
  ash_canyon:        {zone:'VOLCANIC PEAK',name:'Ash Canyon',desc:'Walls of compressed volcanic ash tower on both sides, muffling all sound save for the distant crack of cooling rock.',exits:{west:'volcanic_ridge',east:'cinder_plateau'},base:['ember shard'],mon:[M('rock_crawler','Rock Crawler',60,8,1,75,12,'magma core')],shop:null},
  cinder_plateau:    {zone:'VOLCANIC PEAK',name:'Cinder Plateau',desc:'A flat expanse of cinder and blackened bone stretches to the horizon, scarred by ancient eruptions.',exits:{west:'ash_canyon',south:'deep_forge'},base:['magma core'],mon:[M('fire_elem','Fire Elemental',76,10,2,100,18,'ember shard'),M('lava_golem','Lava Golem',104,12,4,150,28,'magma core')],shop:null},
  deep_forge:        {zone:'VOLCANIC PEAK',name:'Deep Forge',desc:'Ancient dwarven machinery lies half-melted, consumed by the very fires it once harnessed. Rare volcanic minerals glimmer in the debris.',exits:{north:'cinder_plateau'},base:['magma core','wyrm scale'],mon:[M('lava_golem','Lava Golem',120,13,5,175,32,'wyrm scale')],shop:null},
  lava_fields:       {zone:'VOLCANIC PEAK',name:'Lava Fields',desc:'Rivers of slow-moving lava carve glowing channels through the basalt, radiating punishing heat.',exits:{east:'volcanic_peak',west:'molten_river'},base:['ember shard'],mon:[M('fire_imp','Fire Imp',50,7,1,55,10,'ember shard'),M('fire_elem','Fire Elemental',80,10,3,110,20,'magma core')],shop:null},
  molten_river:      {zone:'VOLCANIC PEAK',name:'Molten River',desc:'A roaring channel of liquid rock cuts across the path; the only crossing is a narrow ledge of obsidian.',exits:{east:'lava_fields',west:'fire_shrine'},base:['magma core'],mon:[M('fire_elem','Fire Elemental',90,11,3,125,22,'magma core'),M('rock_wyrm','Rock Wyrm',84,11,3,120,24,'wyrm scale')],shop:null},
  fire_shrine:       {zone:'VOLCANIC PEAK',name:'Fire Shrine',desc:'A crude altar of blackened stone bears offerings of dried lava flowers; embers drift upward like prayers.',exits:{east:'molten_river'},base:['magma core','wyrm scale'],mon:[],shop:null},
  sulfur_vents:      {zone:'VOLCANIC PEAK',name:'Sulfur Vents',desc:'Steam and toxic yellow gas billow from fissures in the floor, stinging the eyes and lungs.',exits:{east:'volcanic_tunnels',west:'magma_chamber'},base:['ember shard'],mon:[M('fire_elem','Fire Elemental',84,10,2,115,20,'magma core'),M('fire_imp','Fire Imp',56,7,1,65,11,'ember shard')],shop:null},
  magma_chamber:     {zone:'VOLCANIC PEAK',name:'Magma Chamber',desc:'The cavern walls glow orange-red, veined with rivers of liquid stone that pulse like a heartbeat.',exits:{east:'sulfur_vents',west:'smelt_cavern'},base:['magma core'],mon:[M('lava_golem','Lava Golem',116,13,5,170,30,'magma core'),M('rock_wyrm','Rock Wyrm',96,11,4,140,26,'wyrm scale')],shop:null},
  smelt_cavern:      {zone:'VOLCANIC PEAK',name:'Smelt Cavern',desc:'Crucibles of black iron hang from the ceiling, dripping molten metal into channels carved in the floor. Rare obsidian veins line the walls.',exits:{east:'magma_chamber'},base:['magma core','obsidian shard'],mon:[M('lava_golem','Lava Golem',124,14,5,185,34,'wyrm scale'),M('rock_wyrm','Rock Wyrm',100,12,4,150,28,'obsidian shard')],shop:null},
  crater_overlook:   {zone:'VOLCANIC PEAK',name:'Crater Overlook',desc:'The full fury of the volcano spreads below — a churning lake of fire that devours the sky with smoke.',exits:{south:'volcanic_peak',north:'basalt_bridge'},base:['ember shard'],mon:[M('fire_imp','Fire Imp',60,8,1,70,12,'ember shard'),M('fire_elem','Fire Elemental',76,10,2,105,19,'ember shard')],shop:null},
  basalt_bridge:     {zone:'VOLCANIC PEAK',name:'Basalt Bridge',desc:'A natural arch of basalt spans a roaring lava pit; the bridge trembles with each distant tremor.',exits:{south:'crater_overlook',north:'fire_sanctum',east:'volcanic_secret'},base:['ember shard'],mon:[M('fire_elem','Fire Elemental',96,11,3,140,25,'magma core'),M('lava_golem','Lava Golem',110,13,4,165,30,'magma core')],shop:null},
  volcanic_secret:   {zone:'VOLCANIC PEAK',name:'Hidden Volcanic Cache',desc:'Tucked behind a curtain of cooled lava, a cache of rare volcanic minerals gleams untouched for ages.',exits:{west:'basalt_bridge'},base:['wyrm scale','obsidian shard'],mon:[],shop:null},
  fire_sanctum:      {zone:'VOLCANIC PEAK',name:'Fire Sanctum',desc:'Pillars of obsidian frame a sacred space where fire elementals once gathered to commune with the volcano\'s spirit.',exits:{south:'basalt_bridge',east:'cinder_tomb'},base:['obsidian shard'],mon:[M('fire_elem','Fire Elemental',100,12,3,145,26,'magma core'),M('lava_golem','Lava Golem',116,13,5,170,31,'obsidian shard')],shop:null},
  cinder_tomb:       {zone:'VOLCANIC PEAK',name:'Cinder Tomb',desc:'The remains of ancient fire worshippers lie entombed in cooled lava, their final expressions ones of pure ecstasy. A shaft in the floor descends into a fortress that makes the volcano feel merely warm.',exits:{west:'fire_sanctum',down:'ember_gate',north:'ember_gate'},base:['obsidian shard','wyrm scale'],mon:[M('rock_wyrm','Rock Wyrm',110,13,5,165,30,'wyrm scale'),M('lava_golem','Lava Golem',130,14,6,195,36,'obsidian shard')],shop:null},

  // ── FROZEN TUNDRA EXPANSION ───────────────────────────────────────────────
  glacier_edge:      {zone:'FROZEN TUNDRA',name:'Glacier Edge',desc:'The tundra ends abruptly at a wall of ancient glacial ice, its blue depths concealing shadows that shift and move.',exits:{east:'frozen_tundra',west:'ice_shelf',south:'tundra_shrine'},base:['ice shard'],mon:[M('frost_wolf','Frost Wolf',50,7,1,50,9,'ice shard'),M('ice_wraith','Ice Wraith',64,8,1,72,13,'ghost essence')],shop:null},
  tundra_shrine:     {zone:'FROZEN TUNDRA',name:'Tundra Shrine',desc:'A ring of ice obelisks surrounds a frozen altar; offerings of frost flowers remain perfectly preserved.',exits:{north:'glacier_edge'},base:['ice crystal','frost pelt'],mon:[],shop:null},
  ice_shelf:         {zone:'FROZEN TUNDRA',name:'Ice Shelf',desc:'A vast shelf of ice overhangs a frozen sea; the wind howls across its surface like a mourning cry.',exits:{east:'glacier_edge',west:'frozen_depths'},base:['ice shard'],mon:[M('frost_wolf','Frost Wolf',60,8,2,62,11,'frost pelt'),M('yeti','Yeti',104,11,4,160,32,'yeti fur')],shop:null},
  frozen_depths:     {zone:'FROZEN TUNDRA',name:'Frozen Depths',desc:'Deep crevasses split the glacial floor; the ice here is so ancient it has turned black with compressed time.',exits:{east:'ice_shelf'},base:['ice crystal','frost pelt'],mon:[M('yeti','Yeti',112,12,4,175,36,'yeti fur'),M('ice_golem','Ice Shard Golem',84,10,6,125,24,'ice crystal')],shop:null},
  snowdrift_hollow:  {zone:'FROZEN TUNDRA',name:'Snowdrift Hollow',desc:'Snowdrifts as tall as towers fill this hollow, their shapes carved by relentless arctic winds into monstrous forms.',exits:{north:'frozen_tundra',south:'blizzard_pass'},base:['ice shard'],mon:[M('frost_wolf','Frost Wolf',56,7,2,58,10,'ice shard'),M('ice_wraith','Ice Wraith',70,9,1,82,15,'ghost essence')],shop:null},
  blizzard_pass:     {zone:'FROZEN TUNDRA',name:'Blizzard Pass',desc:'A narrow mountain pass where permanent blizzard conditions reduce visibility to nothing; only the cold is certain.',exits:{north:'snowdrift_hollow',south:'white_tomb'},base:['ice crystal'],mon:[M('ice_golem','Ice Shard Golem',96,11,4,145,28,'ice crystal'),M('yeti','Yeti',110,12,4,170,34,'yeti fur')],shop:null},
  white_tomb:        {zone:'FROZEN TUNDRA',name:'White Tomb',desc:'An entire village lies buried here, perfectly preserved beneath the snow — frozen mid-life, mid-laugh, mid-scream.',exits:{north:'blizzard_pass'},base:['ice crystal','frost pelt'],mon:[],shop:null},
  ice_labyrinth:     {zone:'FROZEN TUNDRA',name:'Ice Labyrinth',desc:'Walls of translucent blue ice form a maze; reflections multiply in every direction, creatures strike from unexpected angles.',exits:{south:'frozen_cave',north:'crystal_ice_hall'},base:['ice shard'],mon:[M('frost_wolf','Frost Wolf',64,8,2,70,13,'frost pelt'),M('ice_wraith','Ice Wraith',76,9,2,92,17,'ice shard')],shop:null},
  crystal_ice_hall:  {zone:'FROZEN TUNDRA',name:'Crystal Ice Hall',desc:'A grand hall of flawless ice crystals resonates with a low harmonic tone that vibrates the bones.',exits:{south:'ice_labyrinth',east:'glacial_rift'},base:['ice crystal'],mon:[M('ice_golem','Ice Shard Golem',100,12,5,155,30,'ice crystal'),M('frost_knight','Frost Knight',104,13,5,205,42,'frost blade')],shop:null},
  glacial_rift:      {zone:'FROZEN TUNDRA',name:'Glacial Rift',desc:'A massive rift has split the glacier, revealing strata of ice that represent thousands of years of winters.',exits:{west:'crystal_ice_hall',north:'ancient_glacier'},base:['ice crystal'],mon:[M('frost_knight','Frost Knight',108,14,5,215,44,'frost blade'),M('yeti','Yeti',116,12,5,182,38,'yeti fur')],shop:null},
  ancient_glacier:   {zone:'FROZEN TUNDRA',name:'Ancient Glacier',desc:'The oldest ice in the world rests here, entombing creatures from an age before memory in perfect transparency.',exits:{south:'glacial_rift'},base:['ice crystal','frost pelt'],mon:[M('frost_knight','Frost Knight',116,14,6,225,46,'frost blade'),M('ice_golem','Ice Shard Golem',110,12,6,170,34,'ice crystal')],shop:null},
  frozen_barracks:   {zone:'FROZEN TUNDRA',name:'Frozen Barracks',desc:'The barracks of a long-lost ice kingdom, its soldiers still seated at their posts — frozen solid at attention.',exits:{west:'ice_fortress',east:'armory_of_ice'},base:['ice shard'],mon:[M('frost_knight','Frost Knight',104,13,5,208,42,'frost blade'),M('ice_golem','Ice Shard Golem',88,11,5,135,26,'ice crystal')],shop:null},
  armory_of_ice:     {zone:'FROZEN TUNDRA',name:'Armory of Ice',desc:'Weapons forged of enchanted ice line the walls, still razor-sharp despite centuries of cold storage.',exits:{west:'frozen_barracks',east:'frozen_vault'},base:['ice crystal'],mon:[M('frost_knight','Frost Knight',112,14,6,220,45,'frost blade'),M('yeti','Yeti',120,13,5,188,40,'yeti fur')],shop:null},
  frozen_vault:      {zone:'FROZEN TUNDRA',name:'Frozen Vault',desc:'The kingdom\'s treasury, its riches locked in ice thicker than castle walls. Rare gems glimmer beneath the surface.',exits:{west:'armory_of_ice'},base:['ice crystal','frost pelt'],mon:[M('ice_golem','Ice Shard Golem',120,13,7,188,38,'ice crystal'),M('frost_knight','Frost Knight',120,15,6,235,48,'frost blade')],shop:null},

  // ── SKY REALM EXPANSION ───────────────────────────────────────────────────
  upper_winds:       {zone:'SKY REALM',name:'Upper Winds',desc:'The air currents here are powerful enough to carry a person aloft; clouds race past at terrifying speed.',exits:{south:'sky_realm',north:'gale_platform',west:'wind_shrine'},base:['wind shard'],mon:[M('wind_spirit','Wind Spirit',56,8,1,65,15,'wind shard'),M('thunder_hawk','Thunder Hawk',72,10,2,92,20,'storm feather')],shop:null},
  wind_shrine:       {zone:'SKY REALM',name:'Wind Shrine',desc:'A perfectly still pocket of calm air holds an ancient shrine aloft; offerings of feathers drift in gentle circles.',exits:{east:'upper_winds'},base:['storm feather','cloud essence'],mon:[],shop:null},
  gale_platform:     {zone:'SKY REALM',name:'Gale Platform',desc:'A floating stone platform anchored by massive chains; the gale force winds here make every step a battle.',exits:{south:'upper_winds',north:'sky_sanctum',east:'hawk_eyrie'},base:['wind shard'],mon:[M('wind_spirit','Wind Spirit',64,8,2,72,16,'wind shard'),M('thunder_hawk','Thunder Hawk',80,11,2,108,23,'storm feather')],shop:null},
  hawk_eyrie:        {zone:'SKY REALM',name:'Hawk Eyrie',desc:'Giant storm hawks nest in the crags of this floating rock spire, jealously guarding their glittering hoards.',exits:{west:'gale_platform',east:'aerie_peak'},base:['storm feather'],mon:[M('thunder_hawk','Thunder Hawk',90,12,3,125,26,'storm feather'),M('stone_sentinel','Stone Sentinel',104,12,4,185,36,'enchanted gem')],shop:null},
  aerie_peak:        {zone:'SKY REALM',name:'Aerie Peak',desc:'The highest accessible point in the Sky Realm; the world below is invisible beneath a sea of cloud.',exits:{west:'hawk_eyrie'},base:['storm feather','cloud essence'],mon:[M('thunder_hawk','Thunder Hawk',96,12,3,135,28,'storm feather'),M('stone_sentinel','Stone Sentinel',110,13,5,195,38,'enchanted gem')],shop:null},
  sky_sanctum:       {zone:'SKY REALM',name:'Sky Sanctum',desc:'A ring of floating obelisks inscribed with the language of wind; they hum with imprisoned storm energy.',exits:{south:'gale_platform',east:'heaven_gate'},base:['cloud essence'],mon:[M('stone_sentinel','Stone Sentinel',116,13,5,205,40,'enchanted gem'),M('wind_spirit','Wind Spirit',76,10,2,100,22,'cloud essence')],shop:null},
  heaven_gate:       {zone:'SKY REALM',name:'Heaven Gate',desc:'Massive doors of condensed cloud stand open, beyond them only endless blue sky and the silence of the gods. Beyond the gate, reality has visibly fractured — the sky itself is broken.',exits:{west:'sky_sanctum',up:'shattered_entry'},base:['cloud essence','wind shard'],mon:[M('stone_sentinel','Stone Sentinel',124,14,5,218,44,'enchanted gem'),M('thunder_hawk','Thunder Hawk',104,13,3,148,30,'storm feather')],shop:null},
  cloud_maze:        {zone:'SKY REALM',name:'Cloud Maze',desc:'Solidified clouds form a labyrinthine corridor; the walls shift and reform, swallowing paths behind you.',exits:{north:'sky_realm',south:'storm_corridor'},base:['wind shard'],mon:[M('wind_spirit','Wind Spirit',60,8,2,70,16,'wind shard'),M('thunder_hawk','Thunder Hawk',76,10,2,100,21,'storm feather')],shop:null},
  storm_corridor:    {zone:'SKY REALM',name:'Storm Corridor',desc:'Lightning arcs continuously between the cloud-walls; the path forward is lit by a constant strobe of thunder.',exits:{north:'cloud_maze',south:'thunder_vault'},base:['wind shard','storm feather'],mon:[M('stone_sentinel','Stone Sentinel',110,13,4,190,38,'enchanted gem'),M('thunder_hawk','Thunder Hawk',96,12,3,135,27,'storm feather')],shop:null},
  thunder_vault:     {zone:'SKY REALM',name:'Thunder Vault',desc:'The accumulated electrical charge of countless storms crackles within this sealed cloud chamber.',exits:{north:'storm_corridor'},base:['storm feather','cloud essence'],mon:[M('stone_sentinel','Stone Sentinel',124,14,5,215,44,'enchanted gem')],shop:null},
  ruined_observatory:{zone:'SKY REALM',name:'Ruined Observatory',desc:'A shattered dome of sky-glass once allowed scholars to study the stars; charts of dead constellations litter the floor.',exits:{east:'sky_ruins',west:'ancient_sky_temple'},base:['wind shard'],mon:[M('wind_spirit','Wind Spirit',64,9,1,76,17,'wind shard'),M('thunder_hawk','Thunder Hawk',80,10,2,108,22,'storm feather')],shop:null},
  ancient_sky_temple:{zone:'SKY REALM',name:'Ancient Sky Temple',desc:'The oldest structure in the sky realm, half-dissolved by the winds of ages, its relics still radiating power.',exits:{east:'ruined_observatory'},base:['cloud essence','storm feather'],mon:[],shop:null},
  floating_garden:   {zone:'SKY REALM',name:'Floating Garden',desc:'Impossible flowers bloom on floating patches of soil; the scent is overwhelming and slightly intoxicating.',exits:{south:'sky_ruins',north:'sky_garden_deep'},base:['wind shard'],mon:[M('wind_spirit','Wind Spirit',60,8,1,68,15,'wind shard')],shop:null},
  sky_garden_deep:   {zone:'SKY REALM',name:'Sky Garden Deep',desc:'The deeper reaches of the garden where plants have grown without sunlight for centuries, pale and luminous.',exits:{south:'floating_garden',east:'cloud_grotto'},base:['cloud essence'],mon:[M('stone_sentinel','Stone Sentinel',104,12,4,182,36,'enchanted gem'),M('wind_spirit','Wind Spirit',72,9,2,88,20,'cloud essence')],shop:null},
  cloud_grotto:      {zone:'SKY REALM',name:'Cloud Grotto',desc:'A hollow formed entirely of cloud, its walls soft and damp; strange creatures swim through the mist like fish.',exits:{west:'sky_garden_deep'},base:['cloud essence','wind shard'],mon:[M('stone_sentinel','Stone Sentinel',116,13,5,202,40,'enchanted gem'),M('thunder_hawk','Thunder Hawk',100,12,3,142,29,'storm feather')],shop:null},

  // ── SHADOW REALM EXPANSION ───────────────────────────────────────────────
  shadow_swamp:      {zone:'SHADOW REALM',name:'Shadow Swamp',desc:'Black water reflects nothing; the trees here are petrified darkness given form, dripping with shadow-matter.',exits:{north:'shadow_realm',south:'murk_hollow'},base:['shadow essence'],mon:[M('shadow_demon','Shadow Demon',80,11,2,132,26,'shadow essence'),M('nightmare_hound','Nightmare Hound',64,9,1,90,18,'nightmare fang')],shop:null},
  murk_hollow:       {zone:'SHADOW REALM',name:'Murk Hollow',desc:'The hollow is so dark that even magical light is consumed; creatures here navigate by sound and malice.',exits:{north:'shadow_swamp',south:'dread_mire'},base:['shadow essence'],mon:[M('banshee','Banshee',76,10,1,118,23,'spectral dust'),M('shadow_demon','Shadow Demon',88,12,2,145,28,'shadow essence')],shop:null},
  dread_mire:        {zone:'SHADOW REALM',name:'Dread Mire',desc:'Tar-like shadow pools swallow anything that falls; bones of the unwary ring its edges as a warning unheeded.',exits:{north:'murk_hollow',south:'shadow_tomb'},base:['shadow essence','void crystal'],mon:[M('dark_treant','Dark Treant',116,13,3,208,42,'shadow bark'),M('nightmare_hound','Nightmare Hound',80,11,2,118,24,'nightmare fang')],shop:null},
  shadow_tomb:       {zone:'SHADOW REALM',name:'Shadow Tomb',desc:'A sealed crypt of pure shadow matter; the dead here do not rest but stand vigil in eternal darkness.',exits:{north:'dread_mire'},base:['shadow essence','void crystal'],mon:[M('dark_treant','Dark Treant',130,14,4,230,46,'shadow bark'),M('banshee','Banshee',96,12,1,150,30,'spectral dust')],shop:null},
  void_wastes:       {zone:'SHADOW REALM',name:'Void Wastes',desc:'A desolate plain of nothingness stretches outward; even the shadows here have abandoned this place.',exits:{east:'shadow_realm',west:'null_plains'},base:['void crystal'],mon:[M('shadow_demon','Shadow Demon',84,11,2,138,27,'shadow essence'),M('nightmare_hound','Nightmare Hound',70,10,2,95,19,'nightmare fang')],shop:null},
  null_plains:       {zone:'SHADOW REALM',name:'Null Plains',desc:'The ground here reflects no color and absorbs all light; walking feels like falling into an abyss sideways.',exits:{east:'void_wastes',west:'erasure_point',north:'shadow_shrine'},base:['void crystal'],mon:[M('dark_treant','Dark Treant',124,14,4,222,44,'shadow bark'),M('shadow_demon','Shadow Demon',96,12,3,158,31,'void crystal')],shop:null},
  shadow_shrine:     {zone:'SHADOW REALM',name:'Shadow Shrine',desc:'A shrine of pure void energy pulses slowly, drawing shadows inward like a drain.',exits:{south:'null_plains'},base:['shadow essence','nightmare fang'],mon:[],shop:null},
  erasure_point:     {zone:'SHADOW REALM',name:'Erasure Point',desc:'This location is where the Shadow Realm ends and absolute nothing begins; the air here hurts to breathe.',exits:{east:'null_plains'},base:['void crystal','nightmare fang'],mon:[],shop:null},
  screaming_grove:   {zone:'SHADOW REALM',name:'Screaming Grove',desc:'Shadow-trees shriek in the non-wind, their hollow faces frozen in expressions of existential terror.',exits:{south:'nightmare_forest',north:'wailing_abyss'},base:['shadow essence'],mon:[M('dark_treant','Dark Treant',124,14,4,225,45,'shadow bark'),M('banshee','Banshee',90,11,1,138,28,'spectral dust')],shop:null},
  wailing_abyss:     {zone:'SHADOW REALM',name:'Wailing Abyss',desc:'A bottomless pit of screaming shadow energy; the noise is deafening, all-consuming, and utterly hopeless.',exits:{south:'screaming_grove'},base:['nightmare fang','void crystal'],mon:[M('dark_treant','Dark Treant',136,15,4,245,50,'shadow bark'),M('shadow_demon','Shadow Demon',104,13,3,170,34,'void crystal')],shop:null},
  fear_cavern:       {zone:'SHADOW REALM',name:'Fear Cavern',desc:'Every deepest fear is given physical form in this cavern; the walls breathe and pulse with psychic dread.',exits:{north:'nightmare_forest',south:'dread_vault'},base:['shadow essence'],mon:[M('banshee','Banshee',96,12,1,150,30,'spectral dust'),M('nightmare_hound','Nightmare Hound',84,11,2,125,25,'nightmare fang')],shop:null},
  dread_vault:       {zone:'SHADOW REALM',name:'Dread Vault',desc:'Sealed behind doors of crystallized nightmare, this vault holds the essence of fear made tangible.',exits:{north:'fear_cavern',east:'nightmare_altar'},base:['nightmare fang'],mon:[M('dark_treant','Dark Treant',128,14,4,228,46,'shadow bark'),M('shadow_demon','Shadow Demon',100,12,3,162,32,'nightmare fang')],shop:null},
  nightmare_altar:   {zone:'SHADOW REALM',name:'Nightmare Altar',desc:'An altar of black stone weeps shadow-blood; the rituals performed here are best left unimagined.',exits:{west:'dread_vault'},base:['nightmare fang','void crystal'],mon:[],shop:null},
  citadel_ramparts:  {zone:'SHADOW REALM',name:'Citadel Ramparts',desc:'The battlements of the void citadel overlook an infinite abyss; shadow soldiers once defended this post.',exits:{west:'void_citadel',east:'void_spire'},base:['void crystal'],mon:[M('dark_treant','Dark Treant',130,14,4,232,47,'shadow bark'),M('shadow_demon','Shadow Demon',104,13,3,168,34,'void crystal')],shop:null},
  void_spire:        {zone:'SHADOW REALM',name:'Void Spire',desc:'The tallest tower of the citadel pierces a sky of pure darkness; standing here feels like the end of everything.',exits:{west:'citadel_ramparts'},base:['void crystal','nightmare fang'],mon:[M('dark_treant','Dark Treant',140,15,5,252,51,'shadow bark'),M('banshee','Banshee',100,12,2,158,32,'spectral dust')],shop:null},

  // ── CRYSTAL CAVERNS EXPANSION ─────────────────────────────────────────────
  crystal_foyer:     {zone:'CRYSTAL CAVERNS',name:'Crystal Foyer',desc:'Formations of pale crystal frame the entrance to the deeper caverns, catching light that has no source.',exits:{north:'crystal_caverns',south:'refraction_hall'},base:['prismatic shard'],mon:[M('gem_spider','Gem Spider',96,12,3,165,32,'spider gem'),M('crystal_golem','Crystal Golem',130,15,7,262,52,'prismatic shard')],shop:null},
  refraction_hall:   {zone:'CRYSTAL CAVERNS',name:'Refraction Hall',desc:'A hall of perfect natural lenses splits every light ray into a spectrum of impossible colors.',exits:{north:'crystal_foyer',south:'prismatic_cave'},base:['prismatic shard'],mon:[M('crystal_golem','Crystal Golem',136,16,7,272,54,'prismatic shard'),M('gem_spider','Gem Spider',104,13,4,178,35,'spider gem')],shop:null},
  prismatic_cave:    {zone:'CRYSTAL CAVERNS',name:'Prismatic Cave',desc:'The walls, floor, and ceiling are a single continuous crystal that fractures reality into rainbow shards.',exits:{north:'refraction_hall',south:'crystal_tomb'},base:['prismatic shard','diamond core'],mon:[M('crystal_golem','Crystal Golem',144,16,8,288,56,'prismatic shard'),M('diamond_guardian','Diamond Guardian',164,17,9,335,68,'diamond core')],shop:null},
  crystal_tomb:      {zone:'CRYSTAL CAVERNS',name:'Crystal Tomb',desc:'Ancient entities lie entombed in crystal growths, their final moments rendered in perfect crystalline detail.',exits:{north:'prismatic_cave'},base:['diamond core','prismatic shard'],mon:[M('diamond_guardian','Diamond Guardian',176,18,10,358,72,'diamond core'),M('crystal_golem','Crystal Golem',156,17,8,310,62,'prismatic shard')],shop:null},
  luminite_passage:  {zone:'CRYSTAL CAVERNS',name:'Luminite Passage',desc:'Veins of luminite ore glow in the walls, casting a cold blue light that reveals hidden crystal formations.',exits:{east:'crystal_caverns',west:'gem_grotto'},base:['prismatic shard'],mon:[M('gem_spider','Gem Spider',100,12,3,172,34,'spider gem'),M('crystal_golem','Crystal Golem',132,15,7,265,53,'prismatic shard')],shop:null},
  gem_grotto:        {zone:'CRYSTAL CAVERNS',name:'Gem Grotto',desc:'Every surface is studded with raw gemstones; the grotto hums with contained earth-magic.',exits:{east:'luminite_passage',west:'deep_crystal_lair',north:'crystal_shrine'},base:['diamond core'],mon:[M('gem_spider','Gem Spider',110,13,4,188,37,'spider gem'),M('diamond_guardian','Diamond Guardian',170,18,9,342,68,'diamond core')],shop:null},
  crystal_shrine:    {zone:'CRYSTAL CAVERNS',name:'Crystal Shrine',desc:'A shrine carved from a single perfect diamond; light entering it never escapes, but becomes part of its glow.',exits:{south:'gem_grotto'},base:['diamond core','prismatic shard'],mon:[],shop:null},
  deep_crystal_lair: {zone:'CRYSTAL CAVERNS',name:'Deep Crystal Lair',desc:'The deepest known crystal formation; structures here have grown for millennia into impossible geometries.',exits:{east:'gem_grotto'},base:['diamond core','prismatic shard'],mon:[M('diamond_guardian','Diamond Guardian',184,19,10,375,75,'diamond core'),M('crystal_golem','Crystal Golem',160,17,9,320,65,'prismatic shard')],shop:null},
  vault_corridor:    {zone:'CRYSTAL CAVERNS',name:'Vault Corridor',desc:'A passage lined with display cases of the finest gems — all broken open, their contents taken long ago. A hidden alcove glitters to the west.',exits:{south:'gem_vault',north:'hidden_treasury',west:'crystal_hideout_mpt1b3bk'},base:['prismatic shard'],mon:[M('crystal_golem','Crystal Golem',148,16,8,295,58,'prismatic shard'),M('diamond_guardian','Diamond Guardian',172,18,10,348,70,'diamond core')],shop:null},
  hidden_treasury:   {zone:'CRYSTAL CAVERNS',name:'Hidden Treasury',desc:'A chamber sealed behind a wall of crystal, revealed only by the correct resonant frequency — rarely entered.',exits:{south:'vault_corridor'},base:['diamond core','prismatic shard'],mon:[],shop:null},
  diamond_mines:     {zone:'CRYSTAL CAVERNS',name:'Diamond Mines',desc:'Active mine shafts bore deep into pure diamond deposits; the walls sparkle with enough wealth to buy a nation. A narrow cavern opens to the south.',exits:{west:'gem_vault',east:'mine_shaft',south:'smaller_cavern_mpt1efj3'},base:['diamond core'],mon:[M('gem_spider','Gem Spider',108,13,4,185,36,'spider gem'),M('crystal_golem','Crystal Golem',144,16,8,288,57,'prismatic shard')],shop:null},
  mine_shaft:        {zone:'CRYSTAL CAVERNS',name:'Mine Shaft',desc:'A deep shaft plunges into diamond-rich earth; rickety platforms descend into gem-lit darkness below.',exits:{west:'diamond_mines',east:'lost_seam'},base:['diamond core'],mon:[M('diamond_guardian','Diamond Guardian',176,18,10,355,72,'diamond core'),M('gem_spider','Gem Spider',116,14,4,198,40,'diamond core')],shop:null},
  lost_seam:         {zone:'CRYSTAL CAVERNS',name:'Lost Seam',desc:'A forgotten vein of diamond, abandoned when the miners who found it never returned from the depths.',exits:{west:'mine_shaft'},base:['diamond core','prismatic shard'],mon:[],shop:null},
  deep_resonance_chamber:{zone:'CRYSTAL CAVERNS',name:'Deep Resonance Chamber',desc:'The crystal here vibrates at a frequency that disrupts thought; communication is impossible, only sensation exists.',exits:{south:'crystal_depths',east:'crystal_heart'},base:['prismatic shard'],mon:[M('crystal_golem','Crystal Golem',160,17,9,318,64,'prismatic shard'),M('diamond_guardian','Diamond Guardian',180,18,10,362,73,'diamond core')],shop:null},
  crystal_heart:     {zone:'CRYSTAL CAVERNS',name:'Crystal Heart',desc:'The beating heart of the cavern system — a pulsing gem the size of a house that drives all crystal growth.',exits:{west:'deep_resonance_chamber'},base:['diamond core','prismatic shard'],mon:[M('diamond_guardian','Diamond Guardian',190,19,11,385,78,'diamond core'),M('crystal_golem','Crystal Golem',164,17,9,326,66,'prismatic shard')],shop:null},

  // ── HAUNTED KEEP EXPANSION ────────────────────────────────────────────────
  haunted_garden:    {zone:'HAUNTED KEEP',name:'Haunted Garden',desc:'The garden grows without sunlight, its flowers black as ink, releasing an aroma of rot and old blood.',exits:{east:'haunted_keep',west:'overgrown_path'},base:['grave dust'],mon:[M('wailing_specter','Wailing Specter',140,17,4,282,56,'spectral dust'),M('cursed_knight','Cursed Knight',170,20,7,360,72,'cursed blade')],shop:null},
  overgrown_path:    {zone:'HAUNTED KEEP',name:'Overgrown Path',desc:'Ancient paving stones crack under the pressure of black roots; the keep\'s former glory is utterly consumed by decay.',exits:{east:'haunted_garden',west:'tomb_grove'},base:['grave dust'],mon:[M('wailing_specter','Wailing Specter',148,18,4,296,59,'spectral dust'),M('cursed_knight','Cursed Knight',176,20,7,370,74,'cursed blade')],shop:null},
  tomb_grove:        {zone:'HAUNTED KEEP',name:'Tomb Grove',desc:'A grove of dead trees marks the graves of a hundred gardeners, each killed by the garden they once tended.',exits:{east:'overgrown_path',west:'ancient_crypt',south:'keep_shrine'},base:['bone shard'],mon:[M('cursed_knight','Cursed Knight',180,21,8,378,76,'cursed blade'),M('chained_revenant','Chained Revenant',164,19,5,328,66,'revenant dust')],shop:null},
  keep_shrine:       {zone:'HAUNTED KEEP',name:'Keep Shrine',desc:'Hidden beneath a collapsed stone arch, this shrine predates the keep itself, its purpose now mercifully forgotten.',exits:{north:'tomb_grove'},base:['grave dust','revenant dust'],mon:[],shop:null},
  ancient_crypt:     {zone:'HAUNTED KEEP',name:'Ancient Crypt',desc:'The oldest section of the keep\'s burial grounds; the names on these tombs have worn away into silence.',exits:{east:'tomb_grove'},base:['revenant dust','bone shard'],mon:[M('bone_horror','Bone Horror',196,22,6,412,83,'cursed bone'),M('chained_revenant','Chained Revenant',168,19,6,335,68,'revenant dust')],shop:null},
  chapel_ruins:      {zone:'HAUNTED KEEP',name:'Chapel Ruins',desc:'The keep\'s chapel has collapsed inward; the altar has been defaced, its holy symbols replaced with profane carvings.',exits:{north:'haunted_keep',south:'sacristy'},base:['grave dust'],mon:[M('wailing_specter','Wailing Specter',144,17,4,288,57,'spectral dust'),M('cursed_knight','Cursed Knight',172,20,7,365,73,'cursed blade')],shop:null},
  sacristy:          {zone:'HAUNTED KEEP',name:'Sacristy',desc:'The vestry where the keep\'s priests prepared for dark ceremonies; robes of shadow-silk remain on their pegs.',exits:{north:'chapel_ruins',south:'crypt_descent'},base:['bone shard'],mon:[M('cursed_knight','Cursed Knight',184,21,8,382,77,'cursed blade'),M('bone_horror','Bone Horror',192,22,6,404,82,'cursed bone')],shop:null},
  crypt_descent:     {zone:'HAUNTED KEEP',name:'Crypt Descent',desc:'A spiral stair descends into absolute darkness; the sound of dripping water and distant weeping rises from below.',exits:{north:'sacristy'},base:['revenant dust','grave dust'],mon:[M('bone_horror','Bone Horror',200,23,7,420,85,'cursed bone'),M('chained_revenant','Chained Revenant',172,20,6,342,69,'revenant dust')],shop:null},
  torture_chamber:   {zone:'HAUNTED KEEP',name:'Torture Chamber',desc:'The instruments here still operate of their own accord, driven by the residual suffering they have absorbed.',exits:{north:'keep_dungeons',south:'pit_of_souls'},base:['bone shard'],mon:[M('cursed_knight','Cursed Knight',184,21,8,384,78,'cursed blade'),M('bone_horror','Bone Horror',194,22,6,408,83,'cursed bone')],shop:null},
  pit_of_souls:      {zone:'HAUNTED KEEP',name:'Pit of Souls',desc:'A bottomless pit filled with the condensed anguish of every prisoner; souls circle it in perpetual torment.',exits:{north:'torture_chamber'},base:['revenant dust','bone shard'],mon:[M('bone_horror','Bone Horror',204,23,7,428,87,'cursed bone'),M('chained_revenant','Chained Revenant',176,20,6,348,70,'revenant dust')],shop:null},
  forgotten_wing:    {zone:'HAUNTED KEEP',name:'Forgotten Wing',desc:'Sealed off for centuries, this wing of the keep has developed an ecosystem of its own — all of it undead.',exits:{west:'keep_dungeons',east:'collapsed_wing'},base:['bone shard'],mon:[M('bone_horror','Bone Horror',192,22,6,402,81,'cursed bone'),M('wailing_specter','Wailing Specter',156,18,4,312,62,'spectral dust')],shop:null},
  collapsed_wing:    {zone:'HAUNTED KEEP',name:'Collapsed Wing',desc:'The ceiling has partially fallen, creating a maze of rubble through which pale things squeeze and slither.',exits:{west:'forgotten_wing',east:'sealed_vault'},base:['grave dust'],mon:[M('chained_revenant','Chained Revenant',180,20,6,358,72,'revenant dust'),M('bone_horror','Bone Horror',198,22,7,415,84,'cursed bone')],shop:null},
  sealed_vault:      {zone:'HAUNTED KEEP',name:'Sealed Vault',desc:'The keep\'s sealed vault, its lock long corroded away, revealing treasures the lord kept hidden even from death.',exits:{west:'collapsed_wing'},base:['revenant dust','cursed bone'],mon:[],shop:null},
  lord_chambers:     {zone:'HAUNTED KEEP',name:"Lord's Chambers",desc:'The private rooms of the keep\'s last lord; his presence lingers in the cold, manifesting as unseen pressure.',exits:{south:'keep_great_hall',north:'keep_tower'},base:['revenant dust'],mon:[M('bone_horror','Bone Horror',200,23,7,420,86,'cursed bone'),M('chained_revenant','Chained Revenant',176,20,6,348,70,'revenant dust')],shop:null},
  keep_tower:        {zone:'HAUNTED KEEP',name:'Keep Tower',desc:'The highest tower of the haunted keep; from here the lord watched his lands die and found it pleasing.',exits:{south:'lord_chambers'},base:['revenant dust','cursed bone'],mon:[M('bone_horror','Bone Horror',210,23,7,440,90,'cursed bone'),M('cursed_knight','Cursed Knight',192,22,8,400,82,'cursed blade')],shop:null},

  // ── ASTRAL SEA EXPANSION ─────────────────────────────────────────────────
  silver_current:    {zone:'ASTRAL SEA',name:'Silver Current',desc:'A river of pure silver light flows through the astral void, carrying the memories of dead stars in its current.',exits:{west:'astral_sea',east:'planar_reef'},base:['astral essence'],mon:[M('astral_shark','Astral Shark',172,21,5,360,75,'astral fin'),M('plane_walker','Plane Walker',144,19,7,305,62,'astral essence')],shop:null},
  planar_reef:       {zone:'ASTRAL SEA',name:'Planar Reef',desc:'Crystallized planar energy forms reef-like structures, home to creatures that feed on the thoughts of travelers.',exits:{west:'silver_current',east:'void_current'},base:['astral fin'],mon:[M('plane_walker','Plane Walker',156,20,8,330,68,'astral essence'),M('astral_shark','Astral Shark',184,22,6,390,82,'astral fin')],shop:null},
  void_current:      {zone:'ASTRAL SEA',name:'Void Current',desc:'Where silver light meets absolute void, a churning current of annihilating energy tears at the fabric of being.',exits:{west:'planar_reef',east:'astral_abyss'},base:['astral essence','void crystal'],mon:[M('plane_walker','Plane Walker',164,21,8,345,72,'astral essence'),M('githyanki','Githyanki Pirate',176,21,7,368,78,'silver sword')],shop:null},
  astral_abyss:      {zone:'ASTRAL SEA',name:'Astral Abyss',desc:'A region of the astral sea so deep that even thought cannot escape it; the pressure here is philosophical.',exits:{west:'void_current'},base:['astral essence','void crystal'],mon:[M('plane_walker','Plane Walker',172,22,9,360,76,'astral essence'),M('githyanki','Githyanki Pirate',184,22,8,385,82,'silver sword')],shop:null},
  astral_shallows:   {zone:'ASTRAL SEA',name:'Astral Shallows',desc:'The outermost fringes of the astral sea where the boundary with the material world grows thin and permeable.',exits:{north:'astral_sea',south:'drift_zone'},base:['astral fin'],mon:[M('astral_shark','Astral Shark',170,21,5,358,74,'astral fin'),M('plane_walker','Plane Walker',144,19,7,302,61,'astral essence')],shop:null},
  drift_zone:        {zone:'ASTRAL SEA',name:'Drift Zone',desc:'Debris from a dozen shattered planes drifts here in slow orbit; the wreckage of entire civilizations floats by.',exits:{north:'astral_shallows',south:'the_deep_astral',east:'astral_shrine'},base:['astral essence'],mon:[M('githyanki','Githyanki Pirate',172,21,7,362,76,'silver sword'),M('plane_walker','Plane Walker',156,20,8,330,68,'astral essence')],shop:null},
  astral_shrine:     {zone:'ASTRAL SEA',name:'Astral Shrine',desc:'A shrine assembled from the wreckage of seven different planes, each contributing sacred objects to the whole.',exits:{west:'drift_zone'},base:['astral essence','astral fin'],mon:[],shop:null},
  the_deep_astral:   {zone:'ASTRAL SEA',name:'The Deep Astral',desc:'The furthest depths of the astral sea; distance loses meaning here, and time moves at the speed of memory.',exits:{north:'drift_zone'},base:['astral essence','void crystal'],mon:[M('githyanki','Githyanki Pirate',184,22,8,385,82,'silver sword'),M('plane_walker','Plane Walker',170,21,8,358,76,'astral essence')],shop:null},
  wreck_field:       {zone:'ASTRAL SEA',name:'Wreck Field',desc:'Dozens of astral vessels lie in pieces here, the remnants of a war fought between planes.',exits:{east:'astral_wreckage',west:'plunder_hold'},base:['astral fin'],mon:[M('astral_shark','Astral Shark',180,22,6,380,80,'astral fin'),M('githyanki','Githyanki Pirate',170,21,7,358,76,'silver sword')],shop:null},
  plunder_hold:      {zone:'ASTRAL SEA',name:'Plunder Hold',desc:'The sealed cargo hold of the largest wrecked vessel, its contents ransacked except for what hides in the darkness.',exits:{east:'wreck_field'},base:['astral essence','astral fin'],mon:[],shop:null},
  ghost_ship:        {zone:'ASTRAL SEA',name:'Ghost Ship',desc:'An astral galleon crewed entirely by the translucent dead, sailing eternally toward a port that no longer exists.',exits:{north:'astral_wreckage',south:'ship_hold'},base:['astral fin'],mon:[M('plane_walker','Plane Walker',160,20,8,338,70,'astral essence'),M('astral_shark','Astral Shark',184,22,6,388,82,'astral fin')],shop:null},
  ship_hold:         {zone:'ASTRAL SEA',name:'Ship Hold',desc:'The holds of the ghost ship groan with the weight of stolen goods from seven planes, guarded by the jealous dead.',exits:{north:'ghost_ship',south:'captains_vault'},base:['astral essence'],mon:[M('githyanki','Githyanki Pirate',180,22,7,378,80,'silver sword'),M('plane_walker','Plane Walker',164,21,8,345,72,'astral essence')],shop:null},
  captains_vault:    {zone:'ASTRAL SEA',name:"Captain's Vault",desc:'The ghost captain\'s personal vault, sealed with a lock that opens only to the sound of his own death rattle.',exits:{north:'ship_hold'},base:['astral essence','void crystal'],mon:[],shop:null},
  vortex_edge:       {zone:'ASTRAL SEA',name:'Vortex Edge',desc:'The outer rim of a permanent astral vortex that pulls light, matter, and thought into its spiraling core.',exits:{west:'astral_depths',east:'eye_of_void'},base:['astral essence'],mon:[M('githyanki','Githyanki Pirate',176,21,7,368,78,'silver sword'),M('plane_walker','Plane Walker',160,20,8,338,70,'astral essence')],shop:null},
  eye_of_void:       {zone:'ASTRAL SEA',name:'Eye of Void',desc:'The still center of the vortex, where paradoxically nothing moves and everything is simultaneously present.',exits:{west:'vortex_edge'},base:['void crystal','astral essence'],mon:[M('plane_walker','Plane Walker',172,22,9,360,76,'astral essence'),M('githyanki','Githyanki Pirate',184,22,8,388,82,'silver sword')],shop:null},

  // ── VOID SANCTUM EXPANSION ───────────────────────────────────────────────
  outer_void:        {zone:'VOID SANCTUM',name:'Outer Void',desc:'The sanctum\'s outer approach merges with the raw void; the architecture here is half-dissolved into nothingness.',exits:{north:'void_sanctum',south:'void_expanse'},base:['void essence'],mon:[M('void_wraith','Void Wraith',216,25,7,490,98,'void essence'),M('null_horror','Null Horror',252,27,8,580,116,'void crystal')],shop:null},
  void_expanse:      {zone:'VOID SANCTUM',name:'Void Expanse',desc:'An infinite-seeming plain of void energy where distance is meaningless and direction is a polite fiction.',exits:{north:'outer_void',south:'unmaking_grounds'},base:['void essence'],mon:[M('null_horror','Null Horror',256,28,9,588,118,'void crystal'),M('void_wraith','Void Wraith',224,26,8,505,102,'void essence')],shop:null},
  unmaking_grounds:  {zone:'VOID SANCTUM',name:'Unmaking Grounds',desc:'The place where the void actively unmakes reality; items brought here slowly dissolve into their component nothingness.',exits:{north:'void_expanse',south:'the_nothing_edge'},base:['void essence','spectral dust'],mon:[M('void_scholar','Void Scholar',204,24,10,458,93,'forbidden tome'),M('null_horror','Null Horror',264,28,9,598,120,'void crystal')],shop:null},
  the_nothing_edge:  {zone:'VOID SANCTUM',name:'The Nothing Edge',desc:'The absolute boundary of existence; one step further and you would cease to have ever been.',exits:{north:'unmaking_grounds'},base:['void essence','spectral dust'],mon:[M('void_scholar','Void Scholar',216,25,10,482,98,'forbidden tome'),M('null_horror','Null Horror',276,29,10,620,125,'void crystal')],shop:null},
  null_corridor:     {zone:'VOID SANCTUM',name:'Null Corridor',desc:'A corridor where light, sound, and matter propagate at half speed; crossing it takes forever and no time at all.',exits:{east:'void_sanctum',west:'silence_chamber'},base:['void essence'],mon:[M('void_wraith','Void Wraith',220,26,7,496,100,'void essence'),M('void_scholar','Void Scholar',200,24,10,450,92,'forbidden tome')],shop:null},
  silence_chamber:   {zone:'VOID SANCTUM',name:'Silence Chamber',desc:'Perfect acoustic silence reigns here, but the void screams with psychic noise that drowns all thought.',exits:{east:'null_corridor',west:'null_throne',north:'void_shrine'},base:['spectral dust'],mon:[M('void_scholar','Void Scholar',208,24,10,465,95,'forbidden tome'),M('null_horror','Null Horror',260,28,9,592,119,'void crystal')],shop:null},
  void_shrine:       {zone:'VOID SANCTUM',name:'Void Shrine',desc:'A shrine to the void itself — not nihilism, but the pure philosophical concept of absence given reverence.',exits:{south:'silence_chamber'},base:['void essence','spectral dust'],mon:[],shop:null},
  null_throne:       {zone:'VOID SANCTUM',name:'Null Throne',desc:'An empty throne in an empty chamber, its occupant having long since achieved perfect nullity.',exits:{east:'silence_chamber'},base:['void essence','spectral dust'],mon:[M('void_scholar','Void Scholar',216,25,10,482,98,'forbidden tome'),M('null_horror','Null Horror',270,29,9,608,122,'void crystal')],shop:null},
  forbidden_archive: {zone:'VOID SANCTUM',name:'Forbidden Archive',desc:'The sanctum\'s forbidden section; the knowledge here is not dangerous because of what it contains but what knowing it costs.',exits:{south:'void_library',north:'sealed_codex'},base:['void essence'],mon:[M('void_scholar','Void Scholar',212,25,10,475,96,'forbidden tome'),M('null_horror','Null Horror',264,28,9,596,120,'void crystal')],shop:null},
  sealed_codex:      {zone:'VOID SANCTUM',name:'Sealed Codex',desc:'A single sealed tome rests on a plinth; its pages contain the true names of things that should never be named.',exits:{south:'forbidden_archive'},base:['void essence','forbidden tome'],mon:[],shop:null},
  reading_hall:      {zone:'VOID SANCTUM',name:'Reading Hall',desc:'Void scholars sit at their desks for eternity, reading books whose words rearrange faster than comprehension allows.',exits:{west:'void_library',east:'manuscript_vault'},base:['spectral dust'],mon:[M('void_scholar','Void Scholar',208,24,10,462,94,'forbidden tome'),M('void_wraith','Void Wraith',224,26,8,505,102,'void essence')],shop:null},
  manuscript_vault:  {zone:'VOID SANCTUM',name:'Manuscript Vault',desc:'Floor-to-ceiling shelves of manuscripts, each recording the complete history of a universe that no longer exists.',exits:{west:'reading_hall',east:'index_of_endings'},base:['void essence'],mon:[M('null_horror','Null Horror',268,29,9,604,122,'void crystal'),M('void_scholar','Void Scholar',212,25,10,475,96,'forbidden tome')],shop:null},
  index_of_endings:  {zone:'VOID SANCTUM',name:'Index of Endings',desc:'The master index of the sanctum\'s collection — a catalog of every possible apocalypse, cross-referenced by method.',exits:{west:'manuscript_vault'},base:['void essence','forbidden tome'],mon:[],shop:null},
  antechamber_of_void:{zone:'VOID SANCTUM',name:'Antechamber of Void',desc:'The formal waiting chamber before the sanctum\'s inner sanctum; petitioners wait here until they are unmade.',exits:{west:'sanctum_inner',east:'throne_annex'},base:['void essence'],mon:[M('null_horror','Null Horror',276,29,10,620,125,'void crystal'),M('void_scholar','Void Scholar',220,25,10,490,100,'forbidden tome')],shop:null},
  throne_annex:      {zone:'VOID SANCTUM',name:'Throne Annex',desc:'The annexe to the void throne room, where the void\'s most devoted servants await orders that will never come.',exits:{west:'antechamber_of_void'},base:['void essence','spectral dust'],mon:[M('null_horror','Null Horror',284,30,10,636,128,'void crystal'),M('void_wraith','Void Wraith',236,27,8,530,108,'void essence')],shop:null},

  // ══════════════════════════════════════════════════════════════════════════
  // ASHFORD ELITE ZONES (Lv 25-50)
  // ══════════════════════════════════════════════════════════════════════════

  // ── ZONE A: IRON WASTES (Lv 25) ───────────────────────────────────────────
  iron_wastes:        {zone:'IRON WASTES',name:'Iron Wastes',desc:'A ruined industrial landscape of corroded iron, broken war machines, and toxic slag pools stretching to the horizon. The ruined watchtower below is visible at the plateau edge.',exits:{south:'iron_depths',east:'rust_fields',west:'war_remnants',down:'trail_watchtower'},base:['ancient rune'],mon:[M('rust_stalker','Rust Stalker',320,32,12,480,52,'ancient rune'),M('iron_golem','Iron Golem',400,36,14,600,66,'enchanted gem')],shop:null},
  iron_depths:        {zone:'IRON WASTES',name:'Iron Depths',desc:'Tunnels bored through solid iron by machines that have long since turned on their creators; the walls hum with dormant energy.',exits:{north:'iron_wastes',south:'furnace_core',east:'gear_chamber',west:'ore_veins'},base:['ancient rune'],mon:[M('iron_golem','Iron Golem',420,37,15,630,70,'enchanted gem'),M('war_automaton','War Automaton',520,44,17,780,88,'enchanted gem')],shop:null},
  furnace_core:       {zone:'IRON WASTES',name:'Furnace Core',desc:'The heart of the ancient foundry; furnaces the size of cathedrals still burn, fed by ore that loads itself.',exits:{north:'iron_depths',south:'smelting_pit',east:'slag_heap'},base:['enchanted gem'],mon:[M('war_automaton','War Automaton',536,45,17,804,90,'enchanted gem'),M('corroded_titan','Corroded Titan',760,54,19,1140,128,'enchanted gem')],shop:null},
  smelting_pit:       {zone:'IRON WASTES',name:'Smelting Pit',desc:'A vast pit filled with molten metal in which the skeletal frames of unfinished war machines slowly dissolve.',exits:{north:'furnace_core'},base:['enchanted gem'],mon:[M('corroded_titan','Corroded Titan',790,55,20,1185,132,'enchanted gem'),M('war_automaton','War Automaton',544,45,18,816,92,'enchanted gem')],shop:null},
  slag_heap:          {zone:'IRON WASTES',name:'Slag Heap',desc:'Mountains of cooled slag stretch in all directions; within them, discarded weapons still capable of killing.',exits:{west:'furnace_core'},base:['ancient rune'],mon:[M('iron_golem','Iron Golem',430,37,15,645,72,'enchanted gem'),M('war_automaton','War Automaton',530,44,17,795,90,'enchanted gem')],shop:null},
  rust_fields:        {zone:'IRON WASTES',name:'Rust Fields',desc:'Fields of oxidized iron dust stain everything deep red; the air itself tastes of old blood and decay.',exits:{west:'iron_wastes',east:'oxidation_plains',south:'corroded_canyon'},base:['ancient rune'],mon:[M('rust_stalker','Rust Stalker',330,32,12,495,54,'ancient rune'),M('iron_golem','Iron Golem',410,36,14,615,68,'enchanted gem')],shop:null},
  oxidation_plains:   {zone:'IRON WASTES',name:'Oxidation Plains',desc:'Flat plains where every surface has been reduced to powdered rust; automaton husks half-buried in the red earth.',exits:{west:'rust_fields',east:'scrap_heap'},base:['ancient rune'],mon:[M('war_automaton','War Automaton',544,45,17,816,92,'enchanted gem'),M('corroded_titan','Corroded Titan',770,54,19,1155,130,'enchanted gem')],shop:null},
  scrap_heap:         {zone:'IRON WASTES',name:'Scrap Heap',desc:'The final resting place of ten thousand war machines, piled high in a monument to forgotten conflict.',exits:{west:'oxidation_plains'},base:['enchanted gem'],mon:[M('corroded_titan','Corroded Titan',790,55,20,1185,133,'enchanted gem')],shop:null},
  corroded_canyon:    {zone:'IRON WASTES',name:'Corroded Canyon',desc:'A canyon carved by acid runoff from the foundries above; the walls weep rust-colored water.',exits:{north:'rust_fields',south:'rust_tomb'},base:['ancient rune'],mon:[M('iron_golem','Iron Golem',440,38,15,660,73,'enchanted gem'),M('rust_stalker','Rust Stalker',336,33,13,504,56,'ancient rune')],shop:null},
  rust_tomb:          {zone:'IRON WASTES',name:'Rust Tomb',desc:'A chamber where iron warriors were entombed in their armor; centuries of rust have fused flesh and metal into one.',exits:{north:'corroded_canyon'},base:['enchanted gem','ancient rune'],mon:[],shop:null},
  war_remnants:       {zone:'IRON WASTES',name:'War Remnants',desc:'The battlefield where the last war of the iron age ended; weapons still jut from the earth like iron crops.',exits:{east:'iron_wastes',west:'battle_scarred_road'},base:['ancient rune'],mon:[M('rust_stalker','Rust Stalker',316,31,12,474,52,'ancient rune'),M('iron_golem','Iron Golem',410,36,14,615,68,'enchanted gem')],shop:null},
  battle_scarred_road:{zone:'IRON WASTES',name:'Battle-Scarred Road',desc:'An ancient road cratered by explosions and stained with the rust-blood of iron warriors; it leads nowhere good.',exits:{east:'war_remnants',west:'monument_of_war'},base:['ancient rune'],mon:[M('war_automaton','War Automaton',536,44,17,804,90,'enchanted gem'),M('iron_golem','Iron Golem',430,37,15,645,72,'enchanted gem')],shop:null},
  monument_of_war:    {zone:'IRON WASTES',name:'Monument of War',desc:'A massive iron statue of a warrior, long since decapitated — its severed head lies at its feet, still screaming.',exits:{east:'battle_scarred_road'},base:['enchanted gem','ancient rune'],mon:[],shop:null},
  gear_chamber:       {zone:'IRON WASTES',name:'Gear Chamber',desc:'An enormous chamber of interlocking gears, still turning, still grinding, processing nothing but time.',exits:{west:'iron_depths',east:'automaton_bay'},base:['enchanted gem'],mon:[M('iron_golem','Iron Golem',436,37,15,654,72,'enchanted gem'),M('war_automaton','War Automaton',530,44,17,795,89,'enchanted gem')],shop:null},
  automaton_bay:      {zone:'IRON WASTES',name:'Automaton Bay',desc:'Row upon row of dormant war automatons stand at attention; some stir as you approach, recognizing something to destroy.',exits:{west:'gear_chamber',north:'assembly_hall'},base:['enchanted gem'],mon:[M('war_automaton','War Automaton',544,45,17,816,92,'enchanted gem'),M('corroded_titan','Corroded Titan',764,54,19,1146,130,'enchanted gem')],shop:null},
  assembly_hall:      {zone:'IRON WASTES',name:'Assembly Hall',desc:'The final assembly point for the iron army; half-completed colossi hang in iron cradles, waiting for masters long dead.',exits:{south:'automaton_bay',east:'colossus_approach'},base:['enchanted gem'],mon:[M('corroded_titan','Corroded Titan',796,55,20,1194,134,'enchanted gem')],shop:null},
  ore_veins:          {zone:'IRON WASTES',name:'Ore Veins',desc:'Rich veins of iron ore run through the tunnel walls; the ore seems to move, following you with mineral eyes.',exits:{east:'iron_depths',north:'iron_wastes_shrine'},base:['ancient rune'],mon:[M('rust_stalker','Rust Stalker',324,32,12,486,54,'ancient rune'),M('iron_golem','Iron Golem',416,36,14,624,69,'enchanted gem')],shop:null},
  iron_wastes_shrine: {zone:'IRON WASTES',name:'Iron Wastes Shrine',desc:'Hidden within the ore veins, a shrine of pure iron contains offerings left by iron golems in their moments of dreaming.',exits:{south:'ore_veins'},base:['enchanted gem','ancient rune'],mon:[],shop:null},
  colossus_approach:  {zone:'IRON WASTES',name:'Colossus Approach',desc:'The ground shakes with each distant footfall of the Rusted Colossus; the air reeks of oil and oxidization.',exits:{west:'assembly_hall',east:'colossus_throne'},base:['enchanted gem'],mon:[M('corroded_titan','Corroded Titan',800,55,20,1200,135,'enchanted gem')],shop:null},
  colossus_throne:    {zone:'IRON WASTES',name:'Colossus Throne',desc:'The Rusted Colossus sits upon a throne of crushed war machines, ancient beyond reckoning, patient beyond sanity.',exits:{west:'colossus_approach'},base:['enchanted gem'],mon:[M('rusted_colossus','Rusted Colossus',1600,75,25,6400,400,'iron key')],shop:null},

  // ── ZONE B: SUNKEN NECROPOLIS (Lv 28) ────────────────────────────────────
  necropolis_gate:    {zone:'SUNKEN NECROPOLIS',name:'Necropolis Gate',desc:'The gate of the drowned city rises from brackish water; skulls are mortared into the arch, still whispering. A flooded tunnel leads south up into the bog caves above.',exits:{north:'drowned_avenue',east:'crypt_district',west:'bone_harbor',south:'bog_cave'},base:['bone shard'],mon:[M('drowned_knight','Drowned Knight',420,36,14,630,70,'bone shard'),M('sea_lich','Sea Lich',640,48,18,960,106,'ancient tome')],shop:null},
  drowned_avenue:     {zone:'SUNKEN NECROPOLIS',name:'Drowned Avenue',desc:'The main boulevard of the necropolis, submerged to the knee in dark water; the dead march it in eternal procession.',exits:{south:'necropolis_gate',north:'sunken_plaza',east:'tide_vault'},base:['bone shard'],mon:[M('drowned_knight','Drowned Knight',430,37,15,645,72,'bone shard'),M('sea_lich','Sea Lich',650,49,18,975,109,'ancient tome')],shop:null},
  sunken_plaza:       {zone:'SUNKEN NECROPOLIS',name:'Sunken Plaza',desc:'The city\'s central plaza, now a black pool in which the reflections show the city as it once was — alive.',exits:{south:'drowned_avenue',north:'flooded_tower',west:'submerged_library'},base:['grave dust'],mon:[M('sea_lich','Sea Lich',656,49,19,984,110,'ancient tome'),M('necromancer_priest','Necromancer Priest',750,53,19,1125,125,'ancient tome')],shop:null},
  flooded_tower:      {zone:'SUNKEN NECROPOLIS',name:'Flooded Tower',desc:'A tower half-submerged in the rising necropolis waters; things swim in the upper floors where water has pooled.',exits:{south:'sunken_plaza'},base:['grave dust','ancient tome'],mon:[M('bone_leviathan','Bone Leviathan',976,58,21,1464,162,'ancient tome'),M('sea_lich','Sea Lich',664,50,19,996,112,'ancient tome')],shop:null},
  submerged_library:  {zone:'SUNKEN NECROPOLIS',name:'Submerged Library',desc:'An immense library drowned in dark water; the books have long since dissolved, but the knowledge remains suspended in the fluid.',exits:{east:'sunken_plaza'},base:['ancient tome','bone shard'],mon:[M('necromancer_priest','Necromancer Priest',764,54,20,1146,128,'ancient tome'),M('bone_leviathan','Bone Leviathan',984,59,21,1476,164,'ancient tome')],shop:null},
  tide_vault:         {zone:'SUNKEN NECROPOLIS',name:'Tide Vault',desc:'A vault that floods and drains with an inhuman tide cycle; the treasures within surface and submerge at random.',exits:{west:'drowned_avenue',north:'the_deep_crypt'},base:['bone shard'],mon:[M('sea_lich','Sea Lich',660,49,19,990,111,'ancient tome'),M('drowned_knight','Drowned Knight',440,37,15,660,73,'bone shard')],shop:null},
  the_deep_crypt:     {zone:'SUNKEN NECROPOLIS',name:'The Deep Crypt',desc:'The deepest section of the necropolis, its corridors now fully submerged in water black with dissolved bone.',exits:{south:'tide_vault'},base:['ancient tome','grave dust'],mon:[],shop:null},
  crypt_district:     {zone:'SUNKEN NECROPOLIS',name:'Crypt District',desc:'An entire district of mausoleums, their doors hanging open, their occupants departed in search of meaning.',exits:{west:'necropolis_gate',east:'mausoleum_row',south:'ossuary'},base:['bone shard'],mon:[M('drowned_knight','Drowned Knight',436,37,15,654,72,'bone shard'),M('sea_lich','Sea Lich',644,48,18,966,107,'ancient tome')],shop:null},
  mausoleum_row:      {zone:'SUNKEN NECROPOLIS',name:'Mausoleum Row',desc:'An avenue of grand mausoleums, each belonging to a different noble family of the dead city, each guarded by its lineage.',exits:{west:'crypt_district',east:'grand_crypt',north:'lich_antechamber'},base:['grave dust'],mon:[M('necromancer_priest','Necromancer Priest',744,52,19,1116,124,'ancient tome'),M('sea_lich','Sea Lich',652,49,18,978,109,'ancient tome')],shop:null},
  grand_crypt:        {zone:'SUNKEN NECROPOLIS',name:'Grand Crypt',desc:'The grandest crypt in the necropolis, sealed with nine different locks, each key held by a different dead king.',exits:{west:'mausoleum_row'},base:['ancient tome','grave dust'],mon:[M('bone_leviathan','Bone Leviathan',984,59,22,1476,164,'ancient tome'),M('necromancer_priest','Necromancer Priest',770,54,20,1155,129,'ancient tome')],shop:null},
  ossuary:            {zone:'SUNKEN NECROPOLIS',name:'Ossuary',desc:'A chamber entirely constructed from arranged bones; an art form only the necropolis artisans perfected.',exits:{north:'crypt_district',south:'bone_vault'},base:['bone shard'],mon:[M('sea_lich','Sea Lich',656,49,19,984,110,'ancient tome'),M('drowned_knight','Drowned Knight',440,37,15,660,74,'bone shard')],shop:null},
  bone_vault:         {zone:'SUNKEN NECROPOLIS',name:'Bone Vault',desc:'A vault of pure bone-matter, its walls, floors and ceiling formed from a single unbroken skeleton of something enormous.',exits:{north:'ossuary'},base:['bone shard','grave dust'],mon:[M('necromancer_priest','Necromancer Priest',760,53,20,1140,127,'ancient tome'),M('bone_leviathan','Bone Leviathan',976,58,21,1464,162,'ancient tome')],shop:null},
  bone_harbor:        {zone:'SUNKEN NECROPOLIS',name:'Bone Harbor',desc:'The necropolis harbor, choked with bone-ships whose crews continue their voyages in undeath, returning again and again.',exits:{east:'necropolis_gate',west:'shipwreck_bay'},base:['bone shard'],mon:[M('drowned_knight','Drowned Knight',430,37,14,645,71,'bone shard'),M('sea_lich','Sea Lich',644,48,18,966,107,'ancient tome')],shop:null},
  shipwreck_bay:      {zone:'SUNKEN NECROPOLIS',name:'Shipwreck Bay',desc:'A bay littered with bone-hulled wrecks; the tide brings in more each night, an endless harvest of seafaring dead.',exits:{east:'bone_harbor',west:'leviathan_dock'},base:['grave dust'],mon:[M('bone_leviathan','Bone Leviathan',976,58,21,1464,163,'ancient tome'),M('sea_lich','Sea Lich',652,49,18,978,109,'ancient tome')],shop:null},
  leviathan_dock:     {zone:'SUNKEN NECROPOLIS',name:'Leviathan Dock',desc:'A dock built for creatures larger than ships; the chains here could restrain a god, and something has tested them recently.',exits:{east:'shipwreck_bay',north:'sovereign_approach'},base:['ancient tome','grave dust'],mon:[],shop:null},
  lich_antechamber:   {zone:'SUNKEN NECROPOLIS',name:'Lich Antechamber',desc:'The formal receiving chamber of the lich sovereign; supplicants have left offerings of crystallized soul-matter.',exits:{south:'mausoleum_row',north:'necropolis_shrine'},base:['ancient tome'],mon:[M('necromancer_priest','Necromancer Priest',776,54,20,1164,130,'ancient tome'),M('bone_leviathan','Bone Leviathan',980,59,21,1470,163,'ancient tome')],shop:null},
  necropolis_shrine:  {zone:'SUNKEN NECROPOLIS',name:'Necropolis Shrine',desc:'A hidden shrine where the dead come to remember what it felt like to be alive; an air of profound melancholy pervades.',exits:{south:'lich_antechamber'},base:['ancient tome','bone shard'],mon:[],shop:null},
  sovereign_approach: {zone:'SUNKEN NECROPOLIS',name:'Sovereign Approach',desc:'The processional way to the lich sovereign\'s throne; ten thousand skulls line the path, each belonging to a hero.',exits:{south:'leviathan_dock',north:'lich_throne'},base:['ancient tome'],mon:[M('bone_leviathan','Bone Leviathan',990,59,22,1485,165,'ancient tome'),M('necromancer_priest','Necromancer Priest',780,55,20,1170,130,'ancient tome')],shop:null},
  lich_throne:        {zone:'SUNKEN NECROPOLIS',name:'Lich Throne',desc:'The Lich Sovereign holds court in a chamber of crystallized death-energy, its subjects the assembled dead of a thousand years.',exits:{south:'sovereign_approach'},base:['ancient tome'],mon:[M('lich_sovereign','Lich Sovereign',2000,85,28,8000,500,'ancient tome')],shop:null},

  // ── ZONE C: EMBER CITADEL (Lv 32) ────────────────────────────────────────
  ember_gate:         {zone:'EMBER CITADEL',name:'Ember Gate',desc:'The gate of the dragon\'s fortress glows with internal heat; the iron doors are etched with the screaming faces of its victims. A lava shaft leads south back to the volcanic peak above.',exits:{north:'ember_courtyard',east:'lava_barracks',west:'ashfall_plain',south:'cinder_tomb'},base:['wyrm scale'],mon:[M('lava_knight','Lava Knight',576,46,18,864,96,'wyrm scale'),M('fire_drake','Fire Drake',660,50,20,990,110,'wyrm scale')],shop:null},
  ember_courtyard:    {zone:'EMBER CITADEL',name:'Ember Courtyard',desc:'The citadel\'s courtyard burns with eternal fire; the flagstones are volcanic glass, still liquid in the deep cracks.',exits:{south:'ember_gate',north:'drake_roost',east:'heated_corridor'},base:['wyrm scale'],mon:[M('fire_drake','Fire Drake',670,51,20,1005,112,'wyrm scale'),M('lava_knight','Lava Knight',584,46,18,876,97,'wyrm scale')],shop:null},
  drake_roost:        {zone:'EMBER CITADEL',name:'Drake Roost',desc:'Massive stone perches where the citadel\'s drake guardians sleep; the heat from their slumbering bodies is furnace-intense.',exits:{south:'ember_courtyard',north:'fire_spire',west:'nesting_cavern'},base:['wyrm scale'],mon:[M('fire_drake','Fire Drake',680,51,20,1020,113,'wyrm scale'),M('lava_knight','Lava Knight',590,47,18,885,98,'wyrm scale')],shop:null},
  nesting_cavern:     {zone:'EMBER CITADEL',name:'Nesting Cavern',desc:'The cavern where drakes lay their eggs in beds of volcanic ash; the eggs glow like lanterns in the dark.',exits:{east:'drake_roost'},base:['wyrm scale','dragon scale'],mon:[M('fire_drake','Fire Drake',684,52,21,1026,114,'wyrm scale')],shop:null},
  fire_spire:         {zone:'EMBER CITADEL',name:'Fire Spire',desc:'The tallest spire of the ember citadel; from here a dragon surveys its domain of ash and destruction.',exits:{south:'drake_roost'},base:['wyrm scale','dragon scale'],mon:[M('ancient_magma_wyrm','Ancient Magma Wyrm',1040,63,24,1560,173,'dragon scale')],shop:null},
  lava_barracks:      {zone:'EMBER CITADEL',name:'Lava Barracks',desc:'The barracks of the lava knight garrison; their beds are stone slabs, their dreams made of fire.',exits:{west:'ember_gate',east:'armory_of_flame',south:'molten_vault'},base:['wyrm scale'],mon:[M('lava_knight','Lava Knight',584,46,18,876,97,'wyrm scale'),M('fire_drake','Fire Drake',664,51,20,996,111,'wyrm scale')],shop:null},
  armory_of_flame:    {zone:'EMBER CITADEL',name:'Armory of Flame',desc:'Weapons of volcanic iron and dragonbone hang from the walls; each was forged in the belly of a living dragon.',exits:{west:'lava_barracks',east:'forge_of_conquest',north:'siege_hall'},base:['wyrm scale','dragon scale'],mon:[M('fire_drake','Fire Drake',672,51,20,1008,112,'wyrm scale'),M('lava_knight','Lava Knight',590,47,19,885,99,'wyrm scale')],shop:null},
  siege_hall:         {zone:'EMBER CITADEL',name:'Siege Hall',desc:'The staging ground for the dragon\'s conquests; maps of ruined kingdoms are pinned to walls of volcanic rock.',exits:{south:'armory_of_flame'},base:['wyrm scale'],mon:[M('ancient_magma_wyrm','Ancient Magma Wyrm',1024,62,23,1536,170,'dragon scale'),M('fire_drake','Fire Drake',684,52,21,1026,114,'wyrm scale')],shop:null},
  forge_of_conquest:  {zone:'EMBER CITADEL',name:'Forge of Conquest',desc:'The master forge where the citadel\'s most devastating weapons were created; the fires here burn in colors not found in nature.',exits:{west:'armory_of_flame'},base:['dragon scale','wyrm scale'],mon:[M('ancient_magma_wyrm','Ancient Magma Wyrm',1136,67,25,1704,189,'dragon scale')],shop:null},
  molten_vault:       {zone:'EMBER CITADEL',name:'Molten Vault',desc:'A vault where gold and gemstones have half-melted into the floor, forming a glittering mosaic of wealth.',exits:{north:'lava_barracks',south:'dragon_treasury'},base:['wyrm scale'],mon:[M('lava_knight','Lava Knight',590,47,19,885,98,'wyrm scale'),M('fire_drake','Fire Drake',668,51,20,1002,111,'wyrm scale')],shop:null},
  dragon_treasury:    {zone:'EMBER CITADEL',name:'Dragon Treasury',desc:'The dragon\'s private hoard, accumulated over millennia; coins from dead nations form mountains in the firelight.',exits:{north:'molten_vault'},base:['dragon scale','wyrm scale'],mon:[],shop:null},
  ashfall_plain:      {zone:'EMBER CITADEL',name:'Ashfall Plain',desc:'A plain outside the citadel walls permanently blanketed in ash from the volcano above; visibility is measured in steps.',exits:{east:'ember_gate',west:'cinder_wastes'},base:['wyrm scale'],mon:[M('lava_knight','Lava Knight',580,46,18,870,96,'wyrm scale'),M('fire_drake','Fire Drake',660,50,20,990,110,'wyrm scale')],shop:null},
  cinder_wastes:      {zone:'EMBER CITADEL',name:'Cinder Wastes',desc:'Wastes of hot cinder that smolder underfoot; the ruins of villages the dragon personally reduced to ash.',exits:{east:'ashfall_plain',west:'ash_cathedral',north:'ember_shrine'},base:['wyrm scale','magma core'],mon:[M('fire_drake','Fire Drake',672,51,20,1008,112,'wyrm scale'),M('lava_knight','Lava Knight',584,46,18,876,97,'wyrm scale')],shop:null},
  ember_shrine:       {zone:'EMBER CITADEL',name:'Ember Shrine',desc:'An ancient shrine to the fire dragon, built by cultists before the dragon consumed them as an expression of gratitude.',exits:{south:'cinder_wastes'},base:['dragon scale','wyrm scale'],mon:[],shop:null},
  ash_cathedral:      {zone:'EMBER CITADEL',name:'Ash Cathedral',desc:'A cathedral of ash compressed by time into stone, its architecture both beautiful and utterly wrong.',exits:{east:'cinder_wastes'},base:['dragon scale','wyrm scale'],mon:[],shop:null},
  heated_corridor:    {zone:'EMBER CITADEL',name:'Heated Corridor',desc:'A corridor where the walls themselves radiate lethal heat; only those acclimated to fire can traverse it without burning.',exits:{west:'ember_courtyard',east:'wyrm_den'},base:['wyrm scale'],mon:[M('ancient_magma_wyrm','Ancient Magma Wyrm',1016,62,23,1524,169,'dragon scale'),M('fire_drake','Fire Drake',680,51,20,1020,113,'wyrm scale')],shop:null},
  wyrm_den:           {zone:'EMBER CITADEL',name:'Wyrm Den',desc:'The den of the citadel\'s wyrm population; the air is thick with sulfur and shed scales the size of shields.',exits:{west:'heated_corridor',north:'deep_wyrm_lair'},base:['wyrm scale','dragon scale'],mon:[M('ancient_magma_wyrm','Ancient Magma Wyrm',1144,67,25,1716,191,'dragon scale')],shop:null},
  deep_wyrm_lair:     {zone:'EMBER CITADEL',name:'Deep Wyrm Lair',desc:'The deepest section of the wyrm tunnels, where the oldest and largest wyrms coil in volcanic pools.',exits:{south:'wyrm_den',east:'wyrm_throne_approach'},base:['dragon scale'],mon:[M('ancient_magma_wyrm','Ancient Magma Wyrm',1160,68,25,1740,193,'dragon scale')],shop:null},
  wyrm_throne_approach:{zone:'EMBER CITADEL',name:'Wyrm Throne Approach',desc:'The final corridor to the Ancient Magma Wyrm\'s lair; the stone floor is carved with the names of those who tried.',exits:{west:'deep_wyrm_lair',east:'magma_wyrm_throne'},base:['dragon scale'],mon:[M('ancient_magma_wyrm','Ancient Magma Wyrm',1176,69,26,1764,196,'dragon scale')],shop:null},
  magma_wyrm_throne:  {zone:'EMBER CITADEL',name:'Magma Wyrm Throne',desc:'The ancient wyrm coils upon a throne of fused volcanic rock, its scales glowing with the heat of the world\'s core.',exits:{west:'wyrm_throne_approach'},base:['dragon scale'],mon:[M('ancient_magma_wyrm','Ancient Magma Wyrm',2800,100,32,11200,700,'dragon scale')],shop:null},

  // ── ZONE D: SHATTERED PLANES (Lv 37) ─────────────────────────────────────
  shattered_entry:    {zone:'SHATTERED PLANES',name:'Shattered Entry',desc:'The entry point to where reality has fractured; the air shimmers with exposed dimensional boundaries. Heaven Gate is visible below — the last stable structure before the breaking.',exits:{north:'fracture_zone',east:'plane_debris',west:'rift_corridor',down:'heaven_gate'},base:['void crystal'],mon:[M('rift_walker','Rift Walker',776,59,22,1164,130,'void crystal'),M('plane_construct','Plane Construct',940,67,26,1410,156,'prismatic shard')],shop:null},
  fracture_zone:      {zone:'SHATTERED PLANES',name:'Fracture Zone',desc:'The zone of primary fracture where reality broke apart; multiple versions of the same location overlap here.',exits:{south:'shattered_entry',north:'broken_sky',east:'reality_tear'},base:['void crystal'],mon:[M('rift_walker','Rift Walker',784,60,22,1176,130,'void crystal'),M('plane_construct','Plane Construct',948,68,26,1422,158,'prismatic shard')],shop:null},
  broken_sky:         {zone:'SHATTERED PLANES',name:'Broken Sky',desc:'The sky here consists of layered shards of different realities, each showing a different sun, a different doom.',exits:{south:'fracture_zone',north:'edge_of_reality',west:'sky_fracture'},base:['void crystal','prismatic shard'],mon:[M('plane_construct','Plane Construct',956,68,27,1434,160,'prismatic shard'),M('reality_shade','Reality Shade',1096,74,28,1644,183,'void crystal')],shop:null},
  sky_fracture:       {zone:'SHATTERED PLANES',name:'Sky Fracture',desc:'A rift in the sky itself, through which cold void air pours into the shattered planes.',exits:{east:'broken_sky'},base:['void crystal'],mon:[M('reality_shade','Reality Shade',1104,74,29,1656,184,'void crystal'),M('void_abomination','Void Abomination',1430,82,31,2145,238,'void crystal')],shop:null},
  edge_of_reality:    {zone:'SHATTERED PLANES',name:'Edge of Reality',desc:'The outermost boundary of what can still be called real; beyond here, physics becomes a suggestion.',exits:{south:'broken_sky',east:'plane_breaker_approach'},base:['void crystal','prismatic shard'],mon:[M('void_abomination','Void Abomination',1444,82,31,2166,240,'void crystal'),M('reality_shade','Reality Shade',1116,75,29,1674,186,'void crystal')],shop:null},
  plane_debris:       {zone:'SHATTERED PLANES',name:'Plane Debris',desc:'Chunks of a dozen shattered planes drift here; stepping between them requires both agility and a willingness to exist.',exits:{west:'shattered_entry',east:'construct_field',south:'debris_sea'},base:['void crystal'],mon:[M('plane_construct','Plane Construct',944,67,26,1416,158,'prismatic shard'),M('rift_walker','Rift Walker',788,60,23,1182,132,'void crystal')],shop:null},
  construct_field:    {zone:'SHATTERED PLANES',name:'Construct Field',desc:'Planar constructs assemble and disassemble themselves endlessly, performing maintenance protocols for a plane that no longer exists.',exits:{west:'plane_debris',east:'assembly_of_planes',north:'construct_forge'},base:['prismatic shard'],mon:[M('plane_construct','Plane Construct',952,68,26,1428,159,'prismatic shard'),M('void_abomination','Void Abomination',1436,82,31,2154,239,'void crystal')],shop:null},
  construct_forge:    {zone:'SHATTERED PLANES',name:'Construct Forge',desc:'The automated forge that once built planar constructs by the thousands; it still operates, building them for no purpose.',exits:{south:'construct_field'},base:['prismatic shard','void crystal'],mon:[M('void_abomination','Void Abomination',1444,82,31,2166,240,'void crystal'),M('plane_construct','Plane Construct',960,68,27,1440,160,'prismatic shard')],shop:null},
  assembly_of_planes: {zone:'SHATTERED PLANES',name:'Assembly of Planes',desc:'A vast chamber where fragments of different planes are cemented together, creating an impossible patchwork reality.',exits:{west:'construct_field'},base:['void crystal','prismatic shard'],mon:[M('reality_shade','Reality Shade',1116,74,29,1674,186,'void crystal'),M('void_abomination','Void Abomination',1440,82,31,2160,240,'void crystal')],shop:null},
  debris_sea:         {zone:'SHATTERED PLANES',name:'Debris Sea',desc:'A sea of floating reality-debris, each piece a snapshot of a moment in a destroyed plane frozen forever.',exits:{north:'plane_debris',south:'shattered_vault'},base:['void crystal'],mon:[M('rift_walker','Rift Walker',796,60,23,1194,132,'void crystal'),M('plane_construct','Plane Construct',948,68,26,1422,158,'prismatic shard')],shop:null},
  shattered_vault:    {zone:'SHATTERED PLANES',name:'Shattered Vault',desc:'A vault that exists simultaneously in three broken planes; its contents are partially in each.',exits:{north:'debris_sea'},base:['void crystal','prismatic shard'],mon:[],shop:null},
  rift_corridor:      {zone:'SHATTERED PLANES',name:'Rift Corridor',desc:'A corridor lined with open dimensional rifts; each one leads to a different dead plane, all equally empty.',exits:{east:'shattered_entry',west:'dimensional_scar'},base:['void crystal'],mon:[M('reality_shade','Reality Shade',1090,73,28,1635,182,'void crystal'),M('rift_walker','Rift Walker',780,59,22,1170,130,'void crystal')],shop:null},
  dimensional_scar:   {zone:'SHATTERED PLANES',name:'Dimensional Scar',desc:'A permanent scar in dimensional fabric, radiating cold planar energy and a sense of profound wrongness.',exits:{east:'rift_corridor',west:'null_horizon'},base:['void crystal'],mon:[M('void_abomination','Void Abomination',1424,81,30,2136,237,'void crystal'),M('reality_shade','Reality Shade',1096,74,28,1644,183,'void crystal')],shop:null},
  null_horizon:       {zone:'SHATTERED PLANES',name:'Null Horizon',desc:'A horizon of absolute null — the line where the shattered planes end and the void begins, visible as a black wall.',exits:{east:'dimensional_scar',north:'shattered_shrine'},base:['void crystal','prismatic shard'],mon:[],shop:null},
  shattered_shrine:   {zone:'SHATTERED PLANES',name:'Shattered Shrine',desc:'A shrine assembled from fragments of a hundred religious sites, somehow achieving holiness through accumulation.',exits:{south:'null_horizon'},base:['void crystal','prismatic shard'],mon:[],shop:null},
  reality_tear:       {zone:'SHATTERED PLANES',name:'Reality Tear',desc:'A tear in the fabric of reality, through which all possible and impossible things can simultaneously be seen.',exits:{west:'fracture_zone',east:'unstable_ground'},base:['void crystal'],mon:[M('plane_construct','Plane Construct',948,67,26,1422,158,'prismatic shard'),M('reality_shade','Reality Shade',1090,73,28,1635,182,'void crystal')],shop:null},
  unstable_ground:    {zone:'SHATTERED PLANES',name:'Unstable Ground',desc:'Ground that flickers between existing and not existing; each step is a philosophical gamble.',exits:{west:'reality_tear',north:'collapse_point'},base:['void crystal'],mon:[M('void_abomination','Void Abomination',1440,82,31,2160,240,'void crystal'),M('reality_shade','Reality Shade',1104,74,29,1656,184,'void crystal')],shop:null},
  collapse_point:     {zone:'SHATTERED PLANES',name:'Collapse Point',desc:'The focal point of the planes\' collapse; everything nearby bends inward toward this singularity of ruined reality.',exits:{south:'unstable_ground'},base:['void crystal','prismatic shard'],mon:[M('void_abomination','Void Abomination',1450,83,31,2175,241,'void crystal'),M('reality_shade','Reality Shade',1110,74,29,1665,185,'void crystal')],shop:null},
  plane_breaker_approach:{zone:'SHATTERED PLANES',name:'Plane Breaker Approach',desc:'The approach to the Plane Breaker\'s domain; reality here is so damaged that your shadow walks ahead of you.',exits:{west:'edge_of_reality',east:'the_breaking_point'},base:['void crystal'],mon:[M('void_abomination','Void Abomination',1456,83,32,2184,243,'void crystal'),M('reality_shade','Reality Shade',1116,75,29,1674,186,'void crystal')],shop:null},
  the_breaking_point: {zone:'SHATTERED PLANES',name:'The Breaking Point',desc:'The Plane Breaker\'s throne is a paradox made manifest — it exists by virtue of having destroyed everything around it. The destruction here has punched through into the fallen celestial realm below.',exits:{west:'plane_breaker_approach',down:'abyssal_approach',north:'abyssal_approach'},base:['void crystal'],mon:[M('plane_breaker','Plane Breaker',3600,120,38,14400,900,'void crystal')],shop:null},

  // ── ZONE E: THE ABYSSAL GATE (Lv 43) ─────────────────────────────────────
  abyssal_approach:   {zone:'THE ABYSSAL GATE',name:'Abyssal Approach',desc:'The final approach to the fallen celestial realm; the ground is made of compressed prayers, now cold and brittle. The shattered sky above leads back to the Plane Breaker\'s domain.',exits:{north:'abyss_threshold',east:'fallen_bastion',west:'corrupted_heavens',south:'the_breaking_point'},base:['void essence'],mon:[M('corrupted_angel','Corrupted Angel',1016,73,28,1524,170,'void essence'),M('fallen_guardian','Fallen Guardian',1484,89,35,2226,247,'void essence')],shop:null},
  abyss_threshold:    {zone:'THE ABYSSAL GATE',name:'Abyss Threshold',desc:'The threshold between the mortal approach and the fallen realm; the air here weeps with the grief of fallen divinity.',exits:{south:'abyssal_approach',north:'fallen_cathedral',east:'angel_graveyard'},base:['void essence'],mon:[M('corrupted_angel','Corrupted Angel',1024,73,28,1536,170,'void essence'),M('dread_seraph','Dread Seraph',1280,84,33,1920,213,'spectral dust')],shop:null},
  fallen_cathedral:   {zone:'THE ABYSSAL GATE',name:'Fallen Cathedral',desc:'A cathedral built for a god that fell; its spires droop, its stained glass depicts the corruption rather than the glory.',exits:{south:'abyss_threshold',north:'sanctum_of_corruption',west:'corruption_chapel'},base:['void essence','spectral dust'],mon:[M('dread_seraph','Dread Seraph',1290,84,33,1935,215,'spectral dust'),M('fallen_guardian','Fallen Guardian',1496,90,35,2244,249,'void essence')],shop:null},
  corruption_chapel:  {zone:'THE ABYSSAL GATE',name:'Corruption Chapel',desc:'The side chapel where the corruption was first consecrated; the font contains something that is not holy water.',exits:{east:'fallen_cathedral'},base:['void essence'],mon:[M('fallen_guardian','Fallen Guardian',1504,90,35,2256,250,'void essence'),M('dread_seraph','Dread Seraph',1296,85,33,1944,216,'spectral dust')],shop:null},
  sanctum_of_corruption:{zone:'THE ABYSSAL GATE',name:'Sanctum of Corruption',desc:'The inner sanctum where fallen angels perform their inversions of holy rites; the architecture weeps dark ichor.',exits:{south:'fallen_cathedral'},base:['void essence','spectral dust'],mon:[M('abyssal_archon','Abyssal Archon',1864,103,39,2796,311,'void essence'),M('fallen_guardian','Fallen Guardian',1510,90,36,2265,251,'void essence')],shop:null},
  fallen_bastion:     {zone:'THE ABYSSAL GATE',name:'Fallen Bastion',desc:'The celestial bastion, its walls of divine metal now tarnished black, its defenders worse than any enemy.',exits:{west:'abyssal_approach',east:'shattered_ramparts',south:'demon_barracks'},base:['void essence'],mon:[M('fallen_guardian','Fallen Guardian',1490,89,35,2235,248,'void essence'),M('corrupted_angel','Corrupted Angel',1030,73,29,1545,172,'void essence')],shop:null},
  shattered_ramparts: {zone:'THE ABYSSAL GATE',name:'Shattered Ramparts',desc:'The bastion\'s ramparts, shattered from within by the fall; weapons of divine origin litter the rubble.',exits:{west:'fallen_bastion',east:'bastion_keep',north:'tower_of_ruin'},base:['void essence','spectral dust'],mon:[M('dread_seraph','Dread Seraph',1296,85,33,1944,216,'spectral dust'),M('abyssal_archon','Abyssal Archon',1870,103,39,2805,311,'void essence')],shop:null},
  tower_of_ruin:      {zone:'THE ABYSSAL GATE',name:'Tower of Ruin',desc:'The bastion\'s watch tower, from which fallen seraphim survey the corrupted heavens for anything still worth destroying.',exits:{south:'shattered_ramparts'},base:['void essence'],mon:[M('abyssal_archon','Abyssal Archon',1876,104,39,2814,313,'void essence'),M('dread_seraph','Dread Seraph',1304,85,34,1956,217,'spectral dust')],shop:null},
  bastion_keep:       {zone:'THE ABYSSAL GATE',name:'Bastion Keep',desc:'The innermost keep of the fallen bastion; what passes for a court here is a mockery of celestial hierarchy.',exits:{west:'shattered_ramparts'},base:['void essence','spectral dust'],mon:[M('abyssal_archon','Abyssal Archon',1884,104,40,2826,314,'void essence'),M('dread_seraph','Dread Seraph',1310,85,34,1965,218,'spectral dust')],shop:null},
  demon_barracks:     {zone:'THE ABYSSAL GATE',name:'Demon Barracks',desc:'Barracks where corrupted celestials bunk alongside the demons that corrupted them; a grim new fellowship.',exits:{north:'fallen_bastion',south:'abyssal_vault'},base:['void essence'],mon:[M('fallen_guardian','Fallen Guardian',1496,90,35,2244,249,'void essence'),M('corrupted_angel','Corrupted Angel',1036,74,29,1554,172,'void essence')],shop:null},
  abyssal_vault:      {zone:'THE ABYSSAL GATE',name:'Abyssal Vault',desc:'The vault of corrupted celestial artifacts; holy relics bent to unholy purpose, more dangerous for their origin.',exits:{north:'demon_barracks'},base:['void essence','spectral dust'],mon:[],shop:null},
  corrupted_heavens:  {zone:'THE ABYSSAL GATE',name:'Corrupted Heavens',desc:'What were once the outer heavens, now a landscape of beautiful corruption — terrible and gorgeous in equal measure.',exits:{east:'abyssal_approach',west:'celestial_ruin'},base:['void essence'],mon:[M('corrupted_angel','Corrupted Angel',1024,73,28,1536,170,'void essence'),M('dread_seraph','Dread Seraph',1280,84,33,1920,213,'spectral dust')],shop:null},
  celestial_ruin:     {zone:'THE ABYSSAL GATE',name:'Celestial Ruin',desc:'The ruins of a celestial city that predated the fall; its architecture is the most beautiful thing in existence, now broken.',exits:{east:'corrupted_heavens',west:'throne_of_falls',north:'abyssal_shrine'},base:['void essence','spectral dust'],mon:[M('dread_seraph','Dread Seraph',1290,85,33,1935,215,'spectral dust'),M('abyssal_archon','Abyssal Archon',1860,103,39,2790,310,'void essence')],shop:null},
  abyssal_shrine:     {zone:'THE ABYSSAL GATE',name:'Abyssal Shrine',desc:'A shrine hidden within the celestial ruins, maintained by the few angels who fell but refused to be corrupted.',exits:{south:'celestial_ruin'},base:['void essence','spectral dust'],mon:[],shop:null},
  throne_of_falls:    {zone:'THE ABYSSAL GATE',name:'Throne of Falls',desc:'The memorial throne marking where the first angel fell; a monument to betrayal visited by those who would emulate it.',exits:{east:'celestial_ruin'},base:['void essence','spectral dust'],mon:[],shop:null},
  angel_graveyard:    {zone:'THE ABYSSAL GATE',name:'Angel Graveyard',desc:'Where angels go to die; the graves here are filled with compressed light, each one a sun reduced to a box.',exits:{west:'abyss_threshold',east:'halo_vault'},base:['spectral dust'],mon:[M('corrupted_angel','Corrupted Angel',1036,74,29,1554,173,'void essence'),M('dread_seraph','Dread Seraph',1288,84,33,1932,215,'spectral dust')],shop:null},
  halo_vault:         {zone:'THE ABYSSAL GATE',name:'Halo Vault',desc:'A vault of collected halos from fallen angels; they still glow with a light that illuminates guilt.',exits:{west:'angel_graveyard',north:'seraph_lair'},base:['void essence'],mon:[M('dread_seraph','Dread Seraph',1296,85,33,1944,216,'spectral dust'),M('abyssal_archon','Abyssal Archon',1864,103,39,2796,311,'void essence')],shop:null},
  seraph_lair:        {zone:'THE ABYSSAL GATE',name:'Seraph Lair',desc:'The lair of the Dread Seraphim, highest of the fallen, whose wings have grown to encompass entire rooms.',exits:{south:'halo_vault',east:'archon_approach'},base:['void essence','spectral dust'],mon:[M('abyssal_archon','Abyssal Archon',1880,104,40,2820,313,'void essence'),M('dread_seraph','Dread Seraph',1304,85,34,1956,217,'spectral dust')],shop:null},
  archon_approach:    {zone:'THE ABYSSAL GATE',name:'Archon Approach',desc:'The final passage to the Dread Archon\'s throne; the walls are lined with the weapons of every hero who has failed here.',exits:{west:'seraph_lair',east:'throne_of_the_dread'},base:['void essence'],mon:[M('abyssal_archon','Abyssal Archon',1890,104,40,2835,315,'void essence'),M('dread_seraph','Dread Seraph',1310,85,34,1965,218,'spectral dust')],shop:null},
  throne_of_the_dread:{zone:'THE ABYSSAL GATE',name:'Throne of the Dread',desc:'The Dread Archon presides over the fallen realm from a throne of compressed divinity, its power an inversion of creation.',exits:{west:'archon_approach'},base:['void essence'],mon:[M('dread_archon','Dread Archon',4400,145,45,17600,1100,'void essence')],shop:null},

  // ── ZONE F: THE VOID THRONE (Lv 50) ──────────────────────────────────────
  void_throne_gate:   {zone:'THE VOID THRONE',name:'Void Throne Gate',desc:'The final gate, beyond which existence itself becomes uncertain; the gate is made of crystallized impossibility.',exits:{north:'throne_approach_1',east:'void_gallery',west:'realm_of_silence'},base:['void essence'],mon:[M('nameless_herald','Nameless Herald',1416,91,35,2124,236,'void essence'),M('void_incarnate','Void Incarnate',1904,109,40,2856,318,'void essence')],shop:null},
  throne_approach_1:  {zone:'THE VOID THRONE',name:'First Approach',desc:'The beginning of the ascent to the void throne; the air here has forgotten what it is and behaves accordingly.',exits:{south:'void_throne_gate',north:'throne_approach_2',east:'herald_chamber'},base:['void essence'],mon:[M('nameless_herald','Nameless Herald',1424,92,35,2136,237,'void essence'),M('void_incarnate','Void Incarnate',1910,110,40,2865,318,'void essence')],shop:null},
  throne_approach_2:  {zone:'THE VOID THRONE',name:'Second Approach',desc:'Halfway to the void throne, where thought becomes tangible and the mind must defend itself against itself.',exits:{south:'throne_approach_1',north:'antechamber_of_endings',west:'forgotten_shrine'},base:['void essence','spectral dust'],mon:[M('void_incarnate','Void Incarnate',1916,110,41,2874,319,'void essence'),M('eternal_horror','Eternal Horror',2304,128,48,3456,384,'void essence')],shop:null},
  forgotten_shrine:   {zone:'THE VOID THRONE',name:'Forgotten Shrine',desc:'A shrine to something that predates the void itself; even the Nameless God does not approach this place.',exits:{east:'throne_approach_2'},base:['void essence','spectral dust'],mon:[],shop:null},
  antechamber_of_endings:{zone:'THE VOID THRONE',name:'Antechamber of Endings',desc:'The antechamber beyond which the Nameless God waits; the walls here display the endings of every story ever told.',exits:{south:'throne_approach_2',north:'the_void_throne_room'},base:['void essence'],mon:[M('eternal_horror','Eternal Horror',2310,128,48,3465,385,'void essence'),M('void_incarnate','Void Incarnate',1920,110,41,2880,320,'void essence')],shop:null},
  void_gallery:       {zone:'THE VOID THRONE',name:'Void Gallery',desc:'A gallery of void artifacts collected across eternity; each piece is a masterwork of absolute negation.',exits:{west:'void_throne_gate',east:'gallery_of_lost',south:'endless_hall'},base:['void essence'],mon:[M('the_forgotten','The Forgotten',1764,104,41,2646,294,'void essence'),M('void_incarnate','Void Incarnate',1910,110,40,2865,318,'void essence')],shop:null},
  gallery_of_lost:    {zone:'THE VOID THRONE',name:'Gallery of the Lost',desc:'The gallery\'s deeper section, where the artifacts of things that never existed are displayed in cases of solid darkness.',exits:{west:'void_gallery',east:'monument_of_silence'},base:['void essence','spectral dust'],mon:[M('void_incarnate','Void Incarnate',1916,111,41,2874,319,'void essence'),M('eternal_horror','Eternal Horror',2304,128,48,3456,384,'void essence')],shop:null},
  monument_of_silence:{zone:'THE VOID THRONE',name:'Monument of Silence',desc:'A monument to the silence that will follow all things; it radiates a peace that feels like death warmed over.',exits:{west:'gallery_of_lost'},base:['void essence','spectral dust'],mon:[M('eternal_horror','Eternal Horror',2316,129,48,3474,386,'void essence'),M('void_incarnate','Void Incarnate',1920,111,41,2880,320,'void essence')],shop:null},
  endless_hall:       {zone:'THE VOID THRONE',name:'Endless Hall',desc:'A hall with no visible end, its length folding through void-space; the echoes of footsteps return after an eternity.',exits:{north:'void_gallery',south:'eternal_vault'},base:['void essence'],mon:[M('the_forgotten','The Forgotten',1770,105,42,2655,295,'void essence'),M('nameless_herald','Nameless Herald',1436,92,36,2154,239,'void essence')],shop:null},
  eternal_vault:      {zone:'THE VOID THRONE',name:'Eternal Vault',desc:'The vault at the end of the endless hall, containing the possessions of every hero who ever reached this far.',exits:{north:'endless_hall'},base:['void essence','spectral dust'],mon:[],shop:null},
  realm_of_silence:   {zone:'THE VOID THRONE',name:'Realm of Silence',desc:'A realm of absolute, weaponized silence; even thought makes no sound here, and loneliness becomes a physical force.',exits:{east:'void_throne_gate',west:'the_last_corridor'},base:['void essence'],mon:[M('nameless_herald','Nameless Herald',1430,92,36,2145,238,'void essence'),M('the_forgotten','The Forgotten',1764,104,41,2646,294,'void essence')],shop:null},
  the_last_corridor:  {zone:'THE VOID THRONE',name:'The Last Corridor',desc:'The last corridor before the realm ends entirely; beyond the next turning, only the void reliquary and silence.',exits:{east:'realm_of_silence',west:'void_reliquary'},base:['void essence','spectral dust'],mon:[M('void_incarnate','Void Incarnate',1916,110,40,2874,319,'void essence'),M('eternal_horror','Eternal Horror',2304,128,48,3456,384,'void essence')],shop:null},
  void_reliquary:     {zone:'THE VOID THRONE',name:'Void Reliquary',desc:'The reliquary of the void throne, containing the shed aspects of the Nameless God — objects of terrifying power.',exits:{east:'the_last_corridor'},base:['void essence','spectral dust'],mon:[],shop:null},
  herald_chamber:     {zone:'THE VOID THRONE',name:'Herald Chamber',desc:'The chamber of the Nameless God\'s heralds; they have been announcing the coming of something for ten thousand years.',exits:{west:'throne_approach_1',east:'incarnate_den'},base:['void essence'],mon:[M('nameless_herald','Nameless Herald',1440,92,36,2160,240,'void essence'),M('void_incarnate','Void Incarnate',1910,110,40,2865,318,'void essence')],shop:null},
  incarnate_den:      {zone:'THE VOID THRONE',name:'Incarnate Den',desc:'Where the void incarnates dwell between manifestations; their forms are suggestions of form, hints at destruction.',exits:{west:'herald_chamber',north:'horror_vault'},base:['void essence'],mon:[M('void_incarnate','Void Incarnate',1920,111,41,2880,320,'void essence'),M('eternal_horror','Eternal Horror',2310,128,48,3465,385,'void essence')],shop:null},
  horror_vault:       {zone:'THE VOID THRONE',name:'Horror Vault',desc:'The vault of eternal horrors; creatures that have grown beyond any classification move through the infinite dark.',exits:{south:'incarnate_den'},base:['void essence','spectral dust'],mon:[M('eternal_horror','Eternal Horror',2324,129,49,3486,387,'void essence'),M('void_incarnate','Void Incarnate',1924,111,41,2886,321,'void essence')],shop:null},
  the_void_throne_room:{zone:'THE VOID THRONE',name:'The Void Throne Room',desc:'The end of all things. The Nameless God sits upon a throne of crystallized non-existence, having waited since before time for you specifically.',exits:{south:'antechamber_of_endings'},base:['void essence'],mon:[M('the_nameless_god','The Nameless God',6000,170,55,24000,1500,"Void God's Essence")],shop:null}
};

const TELEPORT_ZONES = {
  '1':{dest:'volcanic_peak', name:'Volcanic Peak',  lvl:3,  boss:'Flame Titan',     threat:'Extreme heat, fire elementals.'},
  '2':{dest:'frozen_tundra', name:'Frozen Tundra',  lvl:4,  boss:'Frost Queen',     threat:'Frost damage, slow effects.'},
  '3':{dest:'sky_realm',     name:'Sky Realm',      lvl:5,  boss:'Storm God',       threat:'Lightning storms, high winds.'},
  '4':{dest:'shadow_realm',  name:'Shadow Realm',   lvl:7,  boss:'Void Emperor',    threat:'Necrotic damage, fear effects.'},
  '5':{dest:'crystal_caverns',name:'Crystal Caverns',lvl:8, boss:'Prism Titan',     threat:'Crystal shards, high DEF foes.'},
  '6':{dest:'haunted_keep',  name:'Haunted Keep',   lvl:10, boss:'Death Baron',     threat:'Undead enemies, curse effects.'},
  '7':{dest:'astral_sea',    name:'Astral Sea',     lvl:12, boss:'Astral Leviathan',threat:'Planar damage, void effects.'},
  '8':{dest:'void_sanctum',  name:'Void Sanctum',   lvl:15, boss:'Void God',        threat:'Reality unravels. Maximum danger.'}
};

// ── Ashford (frontier) shrine — high-level zones Lv 25-50 ─────────────────
const TELEPORT_ZONES_2 = {
  'A':{dest:'iron_wastes',       name:'Iron Wastes',        lvl:25, boss:'Rusted Colossus',  threat:'Corroded war machines, iron golems.'},
  'B':{dest:'necropolis_gate',   name:'Sunken Necropolis',  lvl:28, boss:'Lich Sovereign',   threat:'Drowned undead, sea liches.'},
  'C':{dest:'ember_gate',        name:'Ember Citadel',      lvl:32, boss:'Ancient Magma Wyrm',threat:'Fire drakes, lava knights.'},
  'D':{dest:'shattered_entry',   name:'Shattered Planes',   lvl:37, boss:'Plane Breaker',    threat:'Reality fractures, void abominations.'},
  'E':{dest:'abyssal_approach',  name:'The Abyssal Gate',   lvl:43, boss:'Dread Archon',     threat:'Fallen celestials, corrupted angels.'},
  'F':{dest:'void_throne_gate',  name:'The Void Throne',    lvl:50, boss:'The Nameless God', threat:'Beyond existence. The final challenge.'}
};


// ── Map Mole Destinations ─────────────────────────────────────────────────
const MOLE_DESTINATIONS = [
  // Local — 5g
  {n:1,  name:'Town Square',          room:'town_square',      price:5,   tier:'Local',   desc:'Heart of James Village. Shrine, shops, notice board.'},
  {n:2,  name:'The Broken Flagon',    room:'tavern',           price:5,   tier:'Local',   desc:'The tavern. Companions and warm ale.'},
  {n:3,  name:'Temple of the Fallen', room:'temple',           price:5,   tier:'Local',   desc:'Father Aldric and the Guild District.'},
  {n:4,  name:'South Gate',           room:'south_gate',       price:5,   tier:'Local',   desc:'Edge of town. Dungeon stairs, Ashwood beyond.'},
  // Near — 15g
  {n:5,  name:'Ashwood Edge',         room:'ashwood_edge',     price:15,  tier:'Near',    desc:'Pale ash trees. Early hunting grounds.'},
  {n:6,  name:'Deep Ashwood',         room:'ashwood_deep',     price:15,  tier:'Near',    desc:'Forest trolls, wolves. Road east to Ashford.'},
  {n:7,  name:'Dungeon Entrance',     room:'dungeon_entrance', price:15,  tier:'Near',    desc:'Under South Gate. Skeletons and torchlight.'},
  {n:8,  name:'Heart of the Swamp',   room:'swamp_heart',      price:20,  tier:'Near',    desc:'Bog Witch territory. Deepwood roots.'},
  // Mid — 30g
  {n:9,  name:"King's Road",          room:'trail_crossroads', price:30,  tier:'Mid',     desc:'The trail between towns. Bandit territory.'},
  {n:10, name:'Ashford Village',      room:'ashford_square',   price:30,  tier:'Mid',     desc:'The frontier town at the far end of the road.'},
  {n:11, name:'Hill Barrows',         room:'barrow_mound',     price:30,  tier:'Mid',     desc:'Ancient burial mounds. Undead and dark magic.'},
  {n:12, name:'Farmstead Ruins',      room:'farmstead_yard',   price:30,  tier:'Mid',     desc:'Ruined farm. Ghosts, silo rats, animated tools.'},
  // Far — 50-75g
  {n:13, name:'Volcanic Peak',        room:'volcanic_peak',    price:50,  tier:'Far',     desc:'Fire elementals and the Flame Titan. Lv 3+.'},
  {n:14, name:'Frozen Tundra',        room:'frozen_tundra',    price:50,  tier:'Far',     desc:"Frost Queen's domain. Ice and slow. Lv 4+."},
  {n:15, name:'Sky Realm',            room:'sky_realm',        price:50,  tier:'Far',     desc:'Storm God above the clouds. Lv 5+.'},
  {n:16, name:'Shadow Realm',         room:'shadow_realm',     price:75,  tier:'Far',     desc:"Void Emperor's darkness. Lv 7+."},
  {n:17, name:'Crystal Caverns',      room:'crystal_caverns',  price:75,  tier:'Far',     desc:'Prismatic depths. Crystal golems. Lv 8+.'},
  {n:18, name:'Haunted Keep',         room:'haunted_keep',     price:75,  tier:'Far',     desc:'Death Baron at the last set table. Lv 10+.'},
  // Distant — 100g
  {n:19, name:'Astral Sea',           room:'astral_sea',       price:100, tier:'Distant', desc:'Astral Leviathan hunts the shallows. Lv 12+.'},
  {n:20, name:'Void Sanctum',         room:'void_sanctum',     price:100, tier:'Distant', desc:'Void God in the nothing. Lv 15+.'},
  {n:21, name:'Frostheim',            room:'frostheim_square', price:50,  tier:'Far',     desc:'Norse mountain town. Viking gear, Hnefatafl, and the Jarl. Lv 8+.'},
];

// ── Live world state ──────────────────────────────────────────────────────
let world = {};
function initWorld() {
  world = {};
  for (const [id, t] of Object.entries(WT)) {
    world[id] = {
      ...t,
      exits: {...(t.exits||{})},  // deep copy exits so they can't be mutated
      items: [...(t.base||[])],
      monsters: (t.mon||[]).map(m => ({...m}))
    };
  }
  console.log('[Boot] World ready —', Object.keys(world).length, 'rooms');
  // Apply ambient sound metadata by zone/keyword if not set per-room
  const _ambientZoneMap={'DUNGEON':'dungeon','IRONVEIL MINES':'mine','ASHWOOD FOREST':'forest',
    'SWAMP':'swamp','THE FORGOTTEN ARCADE':'arcade','FROSTHEIM':'wind',
    'DROWNED':'water','SHADOW REALM':'void','VOID TEMPLE':'void','ASHFORD CITY':'city'};
  for(const[id,rm] of Object.entries(world)){
    if(!rm.ambient){
      for(const[zone,amb] of Object.entries(_ambientZoneMap)){
        if((rm.zone||'').toUpperCase().includes(zone)){rm.ambient=amb;break;}
      }
    }
  }
}
function respawnWorld() {
  let n = 0;
  for (const [id, t] of Object.entries(WT)) {
    const rm = world[id];
    (t.mon||[]).forEach(tm => {
      const live = rm.monsters.find(m => m.id === tm.id);
      if (!live || live.dead) {
        const i = rm.monsters.findIndex(m => m.id === tm.id);
        const nm = {...tm, hp:tm.maxhp, dead:false};
        if (i >= 0) rm.monsters[i] = nm; else rm.monsters.push(nm);
        n++;
      }
    });
    (t.base||[]).forEach(item => { if (!rm.items.includes(item)) { rm.items.push(item); n++; } });
  }
  if (n > 0) bAll({type:'line',text:'[ The world stirs — monsters and items respawned. ]',cls:'sys'});
}
initWorld();
setInterval(respawnWorld, 5*60*1000);

// Adventurer ambient chatter — every ~4 min, a random online player's adventurer says something
setInterval(()=>{
  const online=[...sessions.values()].filter(s=>s.loggedIn&&s.adventurers?.length&&!s.inCombat);
  if(!online.length)return;
  const p=online[rnd(0,online.length-1)];
  const a=p.adventurers[rnd(0,p.adventurers.length-1)];
  const adv=ADVENTURERS[a.key];if(!adv)return;
  const line=adv.idle[rnd(0,adv.idle.length-1)];
  say(p.ws,`${adv.name}: "${line}"`,'narrate');
},4*60*1000);

// ── Guilds ────────────────────────────────────────────────────────────────
let guilds = {};
function loadGuilds() { try { if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true}); guilds = JSON.parse(fs.readFileSync(GUILD_FILE,'utf8')); } catch { guilds = {}; } }
function ensureGuildStorage(){ Object.values(guilds).forEach(g=>{ if(!g.storage)g.storage=[]; }); }
function saveGuilds() { fs.writeFileSync(GUILD_FILE, JSON.stringify(guilds,null,2)); }
loadGuilds();
ensureGuildStorage();
console.log('[Boot] Guilds loaded —', Object.keys(guilds).length, 'guilds');
// Rebuild guild rooms for any existing guilds
Object.keys(guilds).forEach(gid=>{ try{buildGuildRooms(gid);}catch(e){} });


// ── Housing / Room Rental ─────────────────────────────────────────────────
const HOUSING_FILE = path.join(DATA_DIR, 'housing.json');
let rentedRooms = {}; // username -> {roomId, expires, items:[]}
function loadHousing(){try{rentedRooms=JSON.parse(fs.readFileSync(HOUSING_FILE,'utf8'));}catch{rentedRooms={};}}
function saveHousing(){try{fs.writeFileSync(HOUSING_FILE,JSON.stringify(rentedRooms,null,2));}catch(e){console.error('[HOUSING]',e.message);}}
loadHousing();

const RENTAL_COST = 50; // gold per rent
const RENTAL_DAYS = 7;  // days per rental

function housingCmd(ws,p,sub,rest){
  const inns=['tavern','ashford_inn'];
  switch(sub){
    case'rent':{
      if(!inns.includes(p.room))return say(ws,'You must be at a tavern inn to rent a room. (The Broken Flagon in Shadowmere or The Rusted Nail in Ashford)','err');
      if(rentedRooms[p.username])return say(ws,'You already rent a room. Type ROOM to enter it.','ok');
      if(p.gold<RENTAL_COST)return say(ws,`Need ${RENTAL_COST}g to rent a room for ${RENTAL_DAYS} days.`,'err');
      p.gold-=RENTAL_COST;
      const roomId='private_'+p.username.toLowerCase();
      const expires=Date.now()+(RENTAL_DAYS*24*60*60*1000);
      rentedRooms[p.username]={roomId,expires,items:[],desc:'A small but private room. A bed, a table, a window.'};
      world[roomId]={zone:'PRIVATE QUARTERS',name:`${p.name}'s Room`,
        desc:'A small private room. Your own space in Shadowmere. STORE [item] to leave items here. RETRIEVE [item] to take them.',
        exits:{out:p.room},base:[],mon:[],shop:null,private:p.username};
      saveHousing();svc(p);sidebar(ws,p);
      say(ws,`Room rented for ${RENTAL_DAYS} days. ${RENTAL_COST}g paid. Type ROOM to enter.`,'ok');
      break;
    }
    case'enter':case'':case undefined:{
      const rental=rentedRooms[p.username];
      if(!rental)return say(ws,'No room rented. Visit a tavern: HOUSING RENT costs 50g for 7 days.','err');
      if(Date.now()>rental.expires){
        delete rentedRooms[p.username];
        if(world[rental.roomId])delete world[rental.roomId];
        saveHousing();
        return say(ws,'Your room rental has expired. Visit a tavern to renew (HOUSING RENT).','err');
      }
      // Ensure room exists in world
      if(!world[rental.roomId]){
        world[rental.roomId]={zone:'PRIVATE QUARTERS',name:`${p.name}'s Room`,
          desc:'A small private room.',exits:{out:inns.includes(p.room)?p.room:'tavern'},base:[],mon:[],shop:null,private:p.username};
      }
      world[rental.roomId].exits.out=p.room;
      p.room=rental.roomId;describeRoom(ws,p);
      const days=Math.ceil((rental.expires-Date.now())/(24*60*60*1000));
      say(ws,`  Rental expires in ${days} day(s). HOUSING RENEW to extend.`,'sys');
      if(rental.items&&rental.items.length)say(ws,`  Stored items: ${rental.items.join(', ')}`,'loot');
      sidebar(ws,p);break;
    }
    case'renew':{
      const rental=rentedRooms[p.username];
      if(!rental)return say(ws,'No room rented. Type HOUSING RENT at a tavern.','err');
      if(p.gold<RENTAL_COST)return say(ws,`Need ${RENTAL_COST}g to renew.`,'err');
      p.gold-=RENTAL_COST;
      rental.expires=Math.max(rental.expires,Date.now())+(RENTAL_DAYS*24*60*60*1000);
      saveHousing();svc(p);sidebar(ws,p);
      say(ws,`Room renewed for another ${RENTAL_DAYS} days.`,'ok');break;
    }
    case'store':{
      const rental=rentedRooms[p.username];
      if(!rental||p.room!==rental.roomId)return say(ws,'You must be in your room to store items. HOUSING ENTER first.','err');
      if(!rest)return say(ws,'HOUSING STORE [item]','err');
      const idx=p.inventory.findIndex(i=>i.toLowerCase().includes(rest.toLowerCase()));
      if(idx===-1)return say(ws,"You don't have that.",'err');
      const item=p.inventory.splice(idx,1)[0];
      if(!rental.items)rental.items=[];rental.items.push(item);
      saveHousing();svc(p);sidebar(ws,p);
      say(ws,`${item} stored in your room.`,'ok');break;
    }
    case'retrieve':{
      const rental=rentedRooms[p.username];
      if(!rental||p.room!==rental.roomId)return say(ws,'You must be in your room to retrieve items.','err');
      if(!rest)return say(ws,'HOUSING RETRIEVE [item]','err');
      const idx=(rental.items||[]).findIndex(i=>i.toLowerCase().includes(rest.toLowerCase()));
      if(idx===-1)return say(ws,"That item is not stored here.",'err');
      const item=rental.items.splice(idx,1)[0];
      p.inventory.push(item);saveHousing();svc(p);sidebar(ws,p);
      say(ws,`${item} retrieved.`,'ok');break;
    }
    default:say(ws,'HOUSING: RENT  ENTER  RENEW  STORE [item]  RETRIEVE [item]','sys');
  }
}


// ── Class Specialization (every 10 levels, choose 2 of 5 offered skills) ──
const SPEC_POOL = {
  // Tank specs
  warrior:    ['divine_shield','fortress','consecrate','unholy_ground','bone_shield'],
  paladin:    ['meteor','chain_lightning','holy_nova','purge','inspire'],
  templar:    ['rage','blood_lust','death_strike','reckless_strike','war_cry'],
  deathknight:['plague','soul_drain','lich_form','doom','dark_pact'],
  // Damage specs
  rogue:      ['death_mark','shadow_strike','confuse','wild_magic','jinx'],
  berserker:  ['meteor','chain_lightning','fireball','spell_surge','overload'],
  shadowblade:['poison_blade','death_mark','soul_siphon','banish','doom'],
  warlock:    ['plague','curse_skill','hex','death_mark','unholy_ground'],
  // Magic specs
  mage:       ['chain_lightning','soul_rend','rift','overload','elemental_form'],
  shaman:     ['fireball','meteor','consecrate','regrowth','totem'],
  channeler:  ['holy_nova','dark_aura','inspire','catalyst','purge'],
  spellblade: ['shadow_strike','death_mark','dark_aura','soul_rend','doom'],
  // Support specs
  druid:      ['lay_on_hands','divine_shield','consecrate','inspire','fortress'],
  alchemist:  ['regrowth','totem','ancestral_shield','purge','nature_heal'],
  monk:       ['blood_lust','rage','reckless_strike','war_cry','frenzy'],
  // Summoner specs
  beastmaster:['summon_wolves','entangle','barkskin','alpha_call','wild_instinct'],
  zombie_mage:['doom','dark_pact','plague','unholy_ground','soul_rend'],
  necromancer:['meteor','chain_lightning','fireball','hex','banish'],
  // Misc
  ranger:     ['shadowstep','blink','fade','death_mark','shadow_strike'],
  trickster:  ['meteor','fireball','chain_lightning','doom','plague']
};

function offerSpecialization(ws,p){
  if(!p.pendingSpec){p.pendingSpec=null;}
  const pool=SPEC_POOL[p.classId]||[];
  // Filter out skills already learned
  const available=pool.filter(s=>!(p.extraSkills||[]).includes(s));
  if(available.length<2){say(ws,'No new specializations available for your class at this time.','sys');return;}
  // Pick 5 random from available (or all if less)
  const offered=available.sort(()=>Math.random()-0.5).slice(0,Math.min(5,available.length));
  p.pendingSpec={offered,chosen:[]};
  say(ws,'','sys');
  say(ws,'★ ═══ CLASS SPECIALIZATION ══════════════════════════════ ★','loot');
  say(ws,`You have reached a milestone! Choose 2 new skills to learn:`,'ok');
  offered.forEach((sid,i)=>{
    const sk=SK[sid]||{n:sid};
    say(ws,`  [${i+1}] ${sk.n.padEnd(20)} ${sk.cmb?'(combat)':'(any time)'}`,  'skill');
  });
  say(ws,'Type CHOOSE [1] then CHOOSE [2] to select your two skills.','sys');
  say(ws,'★ ════════════════════════════════════════════════════════ ★','loot');
}

function doChooseSpec(ws,p,numStr){
  if(!p.pendingSpec)return say(ws,'No specialization pending. You earn one every 10 levels.','err');
  const n=parseInt(numStr)-1;
  if(isNaN(n)||n<0||n>=p.pendingSpec.offered.length)return say(ws,`Choose a number between 1 and ${p.pendingSpec.offered.length}.`,'err');
  const sid=p.pendingSpec.offered[n];
  if(p.pendingSpec.chosen.includes(sid))return say(ws,'Already chosen that one.','err');
  p.pendingSpec.chosen.push(sid);
  const sk=SK[sid]||{n:sid};
  say(ws,`✓ Learned: ${sk.n}!`,'loot');
  if(p.pendingSpec.chosen.length>=2){
    // Apply the skills
    if(!p.extraSkills)p.extraSkills=[];
    p.pendingSpec.chosen.forEach(s=>{if(!p.extraSkills.includes(s))p.extraSkills.push(s);});
    p.pendingSpec=null;
    say(ws,'★ Specialization complete! Your new skills are ready to use.','loot');
    svc(p);sidebar(ws,p);
  }else{
    say(ws,'Good. Now choose your second skill.','sys');
  }
}


// ── Leaderboards ──────────────────────────────────────────────────────────
function sendLeaderboardData(ws,cat){
  cat=(cat||'level').toLowerCase().trim();
  const chars=[];
  try{fs.readdirSync(CHAR_DIR).filter(f=>f.endsWith('.json')).forEach(f=>{
    try{const c=JSON.parse(fs.readFileSync(path.join(CHAR_DIR,f),'utf8'));chars.push(c);}catch{}
  });}catch{}
  const cats={
    level:{sort:(a,b)=>(b.level||1)-(a.level||1),   label:'Level',      val:c=>`Lv${c.level||1} ${c.raceName||''} ${c.className||''}`},
    kills:{sort:(a,b)=>(b.killCount||0)-(a.killCount||0), label:'Kills',      val:c=>`${c.killCount||0} kills`},
    gold: {sort:(a,b)=>(b.gold||0)-(a.gold||0),      label:'Gold',       val:c=>`${(c.gold||0).toLocaleString()}g`},
    achieve:{sort:(a,b)=>(b.achievements||[]).length-(a.achievements||[]).length, label:'Achievements', val:c=>`${(c.achievements||[]).length} ach.`},
    poker:{sort:(a,b)=>(b.pokerWins||0)-(a.pokerWins||0), label:'Poker',      val:c=>`${c.pokerWins||0}W / ${c.pokerGold||0}g`},
    deaths:{sort:(a,b)=>(b.deathCount||0)-(a.deathCount||0),label:'Deaths',    val:c=>`${c.deathCount||0} deaths`},
    craft:{sort:(a,b)=>(b.craftCount||0)-(a.craftCount||0), label:'Craft',      val:c=>`${c.craftCount||0} crafted`},
  };
  const def=cats[cat]||cats.level;
  const sorted=[...chars].sort(def.sort).slice(0,15);
  const online=new Set([...sessions.values()].filter(s=>s.loggedIn).map(s=>s.username));
  const rows=sorted.map((c,i)=>({rank:i+1,name:c.name||'?',val:def.val(c),online:online.has(c.username),isAdmin:c.isAdmin}));
  if(ws&&ws.readyState===WS.OPEN)ws.send(JSON.stringify({type:'leaderboard_data',cat,label:def.label,rows,cats:Object.keys(cats)}));
}
function showLeaderboard(ws,cat){
  cat=(cat||'level').toLowerCase();
  // Load all character files
  const chars=[];
  try{
    fs.readdirSync(CHAR_DIR).filter(f=>f.endsWith('.json')).forEach(f=>{
      try{const c=JSON.parse(fs.readFileSync(path.join(CHAR_DIR,f),'utf8'));chars.push(c);}catch{}
    });
  }catch{}
  let sorted,title,val;
  if(cat==='kills'||cat==='kill'){sorted=chars.sort((a,b)=>(b.killCount||0)-(a.killCount||0));title='Top Monster Slayers';val=c=>`${c.killCount||0} kills`;}
  else if(cat==='gold'||cat==='rich'){sorted=chars.sort((a,b)=>(b.gold||0)-(a.gold||0));title='Richest Adventurers';val=c=>`${c.gold||0}g`;}
  else if(cat==='achieve'||cat==='achievements'){sorted=chars.sort((a,b)=>(b.achievements||[]).length-(a.achievements||[]).length);title='Most Achievements';val=c=>`${(c.achievements||[]).length} ach.`;}
  else if(cat==='poker'||cat==='cards'){sorted=chars.sort((a,b)=>(b.pokerWins||0)-(a.pokerWins||0));title='Poker Champions';val=c=>`${c.pokerWins||0} wins / ${c.pokerGold||0}g won`;}
  else if(cat==='deaths'||cat==='death'){sorted=chars.sort((a,b)=>(b.deathCount||0)-(a.deathCount||0));title='Most Fallen';val=c=>`${c.deathCount||0} deaths`;}
  else if(cat==='craft'){sorted=chars.sort((a,b)=>(b.craftCount||0)-(a.craftCount||0));title='Master Crafters';val=c=>`${c.craftCount||0} crafted`;}
  else{sorted=chars.sort((a,b)=>(b.level||1)-(a.level||1));title='Highest Level';val=c=>`Lv${c.level||1} — ${c.raceName||''} ${c.className||''}`;}
  say(ws,'','sys');
  say(ws,`  ┌── James Village Hall of Fame — ${title} ──────────┐`,'loot');
  sorted.slice(0,10).forEach((c,i)=>{
    const online=[...sessions.values()].find(x=>x.username===c.username&&x.loggedIn);
    const medal=['🥇','🥈','🥉'][i]||`  ${i+1}.`;
    say(ws,`  ${medal} ${(c.name||'?').padEnd(15)} ${val(c)}${online?' ●':''}`,i<3?'loot':'sys');
  });
  say(ws,`  └────────────────────────────────────────────────────┘`,'loot');
  say(ws,'  TOP [level/kills/gold/achieve/poker/deaths/craft]','sys');
}


// ── Quest Chain Extensions (unlock after base quests) ────────────────────
const QUEST_CHAINS = {
  // Tormund chain: rats -> missing merchant -> investigate dungeon
  tavern_investigation:{id:'tavern_investigation',giver:'tormund',title:'Something Rotten',
    unlocks_after:'missing_merchant',
    obj:'Investigate the Void Temple in the dungeon lower level.',
    reward:{gold:200,xp:400,item:'Greater Heal'},
    start:"Tormund lowers his voice. 'Aldwyn wasn't the first to disappear. Three merchants in a month. Something in that dungeon is drawing them in. The Void Temple in the lower levels — I heard cultists whispering about it. Will you investigate?'",
    progress:"Tormund: 'The Void Temple — lower dungeon, west of the mid passage. Report back.'",
    complete:"Tormund lets out a long breath. 'So it is the cultists. Void worshippers. I feared as much. Take this — and watch your back out there.'",
    check:p=>(p.zonesVisited||[]).includes('void_temple')||p.room==='void_temple'},

  // Mira chain: herbs -> venom -> rare ingredient
  mira_deepwood:{id:'mira_deepwood',giver:'mira',title:'The Deepwood Root',
    unlocks_after:'mira_venom',
    obj:'Find the deepwood root in the Heart of the Swamp and return it to Mira.',
    reward:{gold:100,xp:200,item:'Full Restore'},
    start:"Mira leans forward. 'With the serpent venom and the right catalyst I can make something truly powerful. There is a root that only grows in the deepest swamp. I have not been able to retrieve it. Would you try?'",
    progress:"Mira: 'The deepwood root. Heart of the swamp — south through the forest border.'",
    complete:"Mira examines the root carefully, eyes bright. 'Perfect specimen. This will last me months.' She hands you a beautifully prepared full restoration draught. 'My finest work.'",
    check:p=>p.inventory.some(i=>i.toLowerCase()==='deepwood root')},

  // Aldric chain: blessing -> relic -> purge the lich
  aldric_crusade:{id:'aldric_crusade',giver:'aldric',title:"The Crusade",
    unlocks_after:'aldric_relic',
    obj:'Defeat the Dungeon Lich and return to Father Aldric.',
    reward:{gold:500,xp:1000,item:"Aldric's Blessing"},
    start:"Aldric stands straighter than before. 'The relic is restored. Now the temple has power again. Use it — take this blessed oil and anoint your weapon before you face the Lich. Only a blessed blade can truly end this curse. Will you go?'",
    progress:"Aldric: 'The Dungeon Lich awaits. Go north through the south gate, down to the dungeon, through to the lower levels. The standing stones will guide you.'",
    complete:"Aldric falls to his knees in prayer, tears streaming. 'It is done. The curse is broken.' He rises and places his hands on your shoulders. 'You have saved this town. The Fallen bless you always.'",
    check:p=>(p.achievements||[]).includes('lich_slayer')}
};

// Register chain items in EQ
EQ["aldric's blessing"]={t:'trinket',atk:5,def:5,desc:"Father Aldric's holy blessing, made physical. Radiates warmth and light."};
EQ['deepwood root']={t:'item',atk:0,def:0,desc:'A gnarled root with potent alchemical properties.'};

// Add deepwood root to swamp_heart

// Notice Board
const notices = [];
function addNotice(author,text){
  notices.unshift({author,text,ts:new Date().toLocaleDateString()});
  if(notices.length>20)notices.pop();
  bAll({type:'line',text:'[Notice Board] '+author+': '+text,cls:'loot'});
}
function showBoard(ws){
  say(ws,'=== James Village Notice Board =====================','loot');
  if(!notices.length)say(ws,'  Empty. POST [message] to add a notice.','sys');
  else notices.forEach((n,i)=>say(ws,'  ['+(i+1)+'] '+n.author+' ('+n.ts+'): '+n.text,'sys'));
  say(ws,'  POST [message] to pin a notice.  BOARD to view.','sys');
}


// ── Auction House ─────────────────────────────────────────────────────────
const AUCTION_FILE = path.join(DATA_DIR, 'auction.json');
let auctionItems = []; // {id, seller, item, price, listed}
let auctionSeq = 1;
function loadAuction(){try{const d=JSON.parse(fs.readFileSync(AUCTION_FILE,'utf8'));auctionItems=d.items||[];auctionSeq=d.seq||1;}catch{auctionItems=[];auctionSeq=1;}}
function saveAuction(){try{if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});fs.writeFileSync(AUCTION_FILE,JSON.stringify({items:auctionItems,seq:auctionSeq},null,2));}catch(e){console.error('[AUCTION SAVE]',e.message);}}
loadAuction();

function auctionCmd(ws,p,sub,rest){
  switch(sub){
    case'list':case'browse':case'':case undefined:{
      say(ws,'═══ Auction House ══════════════════════════════','loot');
      if(!auctionItems.length)return say(ws,'  No items listed. AUCTION SELL [item] [price] to list one.','sys');
      auctionItems.forEach((a,i)=>{
        const eq=EQ[a.item.toLowerCase()];
        const stats=eq?` [${eq.t} ATK+${eq.atk} DEF+${eq.def}]`:'';
        say(ws,`  [${a.id}] ${a.item}${stats} — ${a.price}g  (seller: ${a.seller})${a.seller===p.name?' [YOURS]':''}`,a.seller===p.name?'ok':'sys');
      });
      say(ws,'  AUCTION BUY [#] to purchase.  AUCTION CANCEL [#] to remove your listing.','sys');
      break;
    }
    case'sell':{
      const parts=rest.split(' ');
      const priceStr=parts[parts.length-1];
      const price=parseInt(priceStr);
      if(isNaN(price)||price<1)return say(ws,'Usage: AUCTION SELL [item name] [price]  e.g. AUCTION SELL Iron Sword 50','err');
      const itemQ=parts.slice(0,-1).join(' ');
      const idx=p.inventory.findIndex(i=>i.toLowerCase().includes(itemQ.toLowerCase()));
      if(idx===-1)return say(ws,`You don't have "${itemQ}" in your inventory.`,'err');
      if(auctionItems.filter(a=>a.seller===p.name).length>=5)return say(ws,'You can only list 5 items at a time. Cancel one first.','err');
      const item=p.inventory.splice(idx,1)[0];
      const listing={id:auctionSeq++,seller:p.name,item,price,listed:new Date().toLocaleDateString()};
      auctionItems.push(listing);
      saveAuction();svc(p);sidebar(ws,p);
      say(ws,`Listed ${item} for ${price}g on the Auction House. [Listing #${listing.id}]`,'ok');
      bAll({type:'line',text:`📦 ${p.name} listed ${item} on the Auction House for ${price}g!`,cls:'loot'});
      break;
    }
    case'buy':{
      const id=parseInt(rest);
      if(isNaN(id))return say(ws,'Usage: AUCTION BUY [#]  — use AUCTION LIST to see item numbers.','err');
      const idx=auctionItems.findIndex(a=>a.id===id);
      if(idx===-1)return say(ws,`Listing #${id} not found.`,'err');
      const listing=auctionItems[idx];
      if(listing.seller===p.name)return say(ws,"You can't buy your own listing. Use AUCTION CANCEL to remove it.",'err');
      if(p.gold<listing.price)return say(ws,`Need ${listing.price}g — you have ${p.gold}g.`,'err');
      p.gold-=listing.price;
      p.inventory.push(listing.item);
      auctionItems.splice(idx,1);
      // Pay seller if online
      const seller=[...sessions.values()].find(x=>x.loggedIn&&x.name===listing.seller);
      if(seller){seller.gold+=listing.price;svc(seller);sidebar(seller.ws,seller);say(seller.ws,`📦 ${p.name} bought your ${listing.item} for ${listing.price}g!`,'loot');}
      else{
        // Save gold to seller's file for when they next log in
        const sd=ldc(listing.seller.toLowerCase());
        if(sd){sd.gold=(sd.gold||0)+listing.price;try{fs.writeFileSync(cf(listing.seller.toLowerCase()),JSON.stringify(sd,null,2));}catch{}}
      }
      saveAuction();svc(p);sidebar(ws,p);
      say(ws,`Purchased ${listing.item} for ${listing.price}g!`,'ok');
      const eq=EQ[listing.item.toLowerCase()];
      if(eq)say(ws,`  [${eq.t.toUpperCase()}] ATK+${eq.atk} DEF+${eq.def} — EQUIP ${listing.item} to use it.`,'sys');
      bAll({type:'line',text:`📦 ${p.name} bought ${listing.item} from ${listing.seller} at the Auction House!`,cls:'loot'});
      break;
    }
    case'cancel':{
      const id=parseInt(rest);
      if(isNaN(id))return say(ws,'Usage: AUCTION CANCEL [#]','err');
      const idx=auctionItems.findIndex(a=>a.id===id&&a.seller===p.name);
      if(idx===-1)return say(ws,`Listing #${id} not found or not yours.`,'err');
      const item=auctionItems.splice(idx,1)[0].item;
      p.inventory.push(item);
      saveAuction();svc(p);sidebar(ws,p);
      say(ws,`Listing cancelled. ${item} returned to your inventory.`,'ok');
      break;
    }
    default:say(ws,'Auction: LIST  SELL [item] [price]  BUY [#]  CANCEL [#]','sys');
  }
}


// ── Day/Night Cycle & Weather ─────────────────────────────────────────────
const WEATHER_TYPES = ['clear','clear','clear','rain','rain','storm','fog','fog'];
const TIMES = ['dawn','morning','afternoon','dusk','evening','night','midnight','deep night'];
let gameHour = new Date().getHours() % 8; // 0-7 maps to 8 time periods
let weather = 'clear';
let isNight = false;

function updateDayNight(){
  gameHour = (gameHour+1) % 8;
  isNight = gameHour >= 4; // evening through deep night
  weather = WEATHER_TYPES[Math.floor(Math.random()*WEATHER_TYPES.length)];
  const timeStr = TIMES[gameHour];
  const weatherStr = weather==='clear'?'The skies are clear.':weather==='rain'?'Rain falls steadily.':weather==='storm'?'A fierce storm rages!':'A thick fog rolls in.';
  const msg = `[ ${timeStr.toUpperCase()} — ${weatherStr}${isNight?' Night creatures stir.':' Daylight holds.'} ]`;
  bAll({type:'line',text:msg,cls:'narrate'});
  if(weather==='clear'&&!isNight){
    // Clear day XP bonus announcement
    bAll({type:'line',text:'[ Clear skies — +10% XP bonus for the next hour! ]',cls:'ok'});
  }
  if(weather==='storm'){
    bAll({type:'line',text:'[ STORM WARNING — Outdoor areas more dangerous! ]',cls:'err'});
  }
  console.log(`[Time] ${timeStr}, weather: ${weather}, night: ${isNight}`);
}

// Night-only monsters (added to outdoor rooms at night)
const NIGHT_MONSTERS = [
  {id:'shadow_stalker',name:'Shadow Stalker',hp:35,maxhp:35,atk:10,def:2,xp:85,gold:18,loot:'shadow essence'},
  {id:'night_horror',name:'Night Horror',  hp:28,maxhp:28,atk:12,def:1,xp:70,gold:15,loot:'nightmare fang'}
];
const OUTDOOR_ROOMS = ['ashwood_edge','ashwood_deep','forest_camp','forest_ruins','swamp_border','swamp_heart','south_gate',
  'trail_crossroads','trail_ravine_path','trail_hillcrest','trail_old_camp','trail_valley','trail_burned_hamlet',
  'trail_stone_bridge','trail_overgrown_road','trail_watchtower','trail_fields',
  'bog_track_1','bog_track_2','bog_shrine','bog_cave',
  'barrow_mound','farmstead_gate','farmstead_yard','farmstead_silo',
  'west_road','mine_trail_1','mine_trail_2','quarry_outlook',
  'north_gate','mountain_foothills','mountain_lookout','frost_trail_1','frost_trail_2',
  'glacier_cave','frost_trail_3','ice_pass','storm_ridge','frostheim_approach','frozen_docks'];

// ── Safe town zones — no combat, no monster aggro, no PvP ────────────────
const SAFE_ZONES = new Set([
  // Town of Shadowmere
  'town_square','adventure_shrine','market_street','pet_store','weaponsmith','grimwald_back',
  'arcade_c64','alley','map_shop','black_market','tavern','apothecary','temple',
  'guild_district','guild_registry','guild_hall_row',
  // Ashford Village (proper — not outskirts or bandit camp)
  'ashford_gate','ashford_square','ashford_shrine','ashford_store','ashford_inn','ashford_inn_yard',
  'ashford_healer','ashford_market_row','the_crucible','arcane_vault',
  'shadow_market_ashford','deadwood_apothecary','guild_outpost','temple_crypt',
  // Mine entrance (Varn's post — safe trading area)
  'mine_entrance',
  // Frostheim — Norse mountain town
  'frostheim_square','mead_hall','hnefatafl_hall','frostheim_market',
  'frostheim_smith','frostheim_armory','rune_temple','frozen_docks'
]);

function applyNightMonsters(){
  OUTDOOR_ROOMS.forEach(rid=>{
    if(!world[rid])return;
    if(isNight){
      NIGHT_MONSTERS.forEach(nm=>{
        if(!world[rid].monsters.find(m=>m.id===nm.id))
          world[rid].monsters.push({...nm,dead:false});
      });
    }else{
      world[rid].monsters=world[rid].monsters.filter(m=>!NIGHT_MONSTERS.find(n=>n.id===m.id));
    }
  });
}

// Run every real hour
setInterval(()=>{updateDayNight();applyNightMonsters();}, 60*60*1000);
// Initial call happens after sessions is defined (see bottom of file)

function getTimeWeather(){return {hour:TIMES[gameHour],weather,isNight};}

// ── Parties ───────────────────────────────────────────────────────────────
const parties = new Map();
let partySeq = 0;
function getParty(username) {
  for (const [id, party] of parties) {
    if (party && party.members && party.members.has(username)) return {id, ...party};
  }
  return null;
}

// ── Sessions ──────────────────────────────────────────────────────────────
const sessions = new Map();
// ── Theater shared-viewing state ──────────────────────────────────────────
let _theaterNowPlaying = null; // {filmId, startedAt} or null
let _theaterBroadcaster = null; // {username, ws} when a player is sharing screen
const _pvpChallenges = new Map(); // targetUsername → {challenger, levelDiff, expires}
const _pvpArcadeGames = new Map(); // lowerUsername → {higherPlayer, lowerPlayer}

// ══════════════════════════════════════════════════════════════════════════
// ── MULTIPLAYER POKER — Crag's Table ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
const _PT_SB=5, _PT_BB=10, _PT_START_STACK=200;
let _pt=null; // the shared table

function _ptDeck(){
  const d=[];
  for(const s of['♠','♥','♦','♣'])for(const r of['2','3','4','5','6','7','8','9','10','J','Q','K','A'])d.push({r,s});
  for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}
  return d;
}
const _PT_RV={'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};
function _ptEval5(cards){
  const vals=cards.map(c=>_PT_RV[c.r]||0).sort((a,b)=>b-a);
  const suits=cards.map(c=>c.s);
  const flush=suits.every(s=>s===suits[0]);
  const uniq=[...new Set(vals)].sort((a,b)=>b-a);
  const counts=uniq.map(v=>vals.filter(x=>x===v).length);
  let straight=false,strHigh=0;
  if(uniq.length===5){
    if(uniq[0]-uniq[4]===4){straight=true;strHigh=uniq[0];}
    else if(uniq[0]===14&&uniq[1]===5&&uniq[4]===2){straight=true;strHigh=5;}
  }
  const srt=uniq.map((v,i)=>({v,c:counts[i]})).sort((a,b)=>b.c-a.c||b.v-a.v);
  const tb=srt.map(x=>x.v);
  if(flush&&straight)return{rank:8,name:'Straight Flush',tb:[strHigh]};
  if(srt[0].c===4)return{rank:7,name:'Four of a Kind',tb};
  if(srt[0].c===3&&srt[1]?.c===2)return{rank:6,name:'Full House',tb};
  if(flush)return{rank:5,name:'Flush',tb:vals};
  if(straight)return{rank:4,name:'Straight',tb:[strHigh]};
  if(srt[0].c===3)return{rank:3,name:'Three of a Kind',tb};
  if(srt[0].c===2&&srt[1]?.c===2)return{rank:2,name:'Two Pair',tb};
  if(srt[0].c===2)return{rank:1,name:'One Pair',tb};
  return{rank:0,name:'High Card',tb:vals};
}
function _ptCombos(arr,k){
  if(k===0)return[[]];if(arr.length===k)return[arr];
  const[h,...t]=arr;
  return[..._ptCombos(t,k-1).map(c=>[h,...c]),..._ptCombos(t,k)];
}
function _ptEvalHand(cards){
  const combos=_ptCombos(cards,5);let best=null;
  for(const c of combos){const ev=_ptEval5(c);if(!best||_ptCmp(ev,best)>0)best=ev;}
  return best||{rank:0,name:'High Card',tb:[]};
}
function _ptCmp(a,b){
  if(a.rank!==b.rank)return a.rank-b.rank;
  for(let i=0;i<Math.max(a.tb.length,b.tb.length);i++){const d=(a.tb[i]||0)-(b.tb[i]||0);if(d)return d;}
  return 0;
}
function _ptRaw(seat,msg){if(!seat.isAI&&seat.ws&&seat.ws.readyState===1)seat.ws.send(JSON.stringify(msg));}
function _ptSay(seat,text,cls='sys'){if(!seat.isAI&&seat.ws&&seat.ws.readyState===1)say(seat.ws,text,cls);}
function _ptSendState(extraMsg){
  if(!_pt)return;
  const t=_pt;
  t.seats.forEach((seat,i)=>{
    if(seat.isAI||!seat.ws||seat.ws.readyState!==1)return;
    _ptRaw(seat,{
      type:'poker_table',
      stage:t.stage, community:t.community, pot:t.pot,
      curSeat:t.cur, dealerSeat:t.dealer, handNum:t.handNum,
      highBet:t.highBet,
      seats:t.seats.map((s,j)=>({
        name:s.name, username:s.username, stack:s.stack,
        bet:s.bet||0, folded:!!s.folded, allIn:!!s.allIn, isAI:!!s.isAI,
        spectating:!!s.spectating,
        isCur:j===t.cur, isYou:j===i,
        hole:(j===i||(t.stage==='showdown'&&!s.folded&&!s.spectating))?s.hole:null,
        handName:(t.stage==='showdown'&&!s.folded&&!s.spectating)?s.handName:null,
      })),
      msg:extraMsg||null,
    });
  });
}
function _ptBcast(text,cls){
  if(!_pt)return;
  _pt.seats.forEach(s=>{if(!s.isAI)_ptSay(s,text,cls||'sys');});
}
function _ptJoin(ws,p,buyIn){
  if(!_pt)_pt={seats:[],deck:[],community:[],pot:0,stage:'waiting',cur:-1,dealer:-1,highBet:0,minRaise:_PT_BB,handNum:0,nextTimer:null};
  const t=_pt;
  if(t.seats.find(s=>s.username===p.username)){
    // Rejoin — send current state
    const seat=t.seats.find(s=>s.username===p.username);
    seat.ws=ws;
    _ptSendState();
    return say(ws,"You're back at the table.",'sys');
  }
  if(t.seats.filter(s=>!s.isAI).length>=5)return say(ws,"Crag's table is full (5 players + Crag).",'err');
  const stack=Math.max(_PT_START_STACK,buyIn||_PT_START_STACK);
  // spectating:true = joined mid-hand, sits out until next deal
  const spectating = t.stage!=='waiting';
  t.seats.push({username:p.username,name:p.name,ws,stack,buyIn:stack,bet:0,hole:[],folded:false,allIn:false,isAI:false,acted:false,spectating});
  // Always add Crag as AI seat if missing
  if(!t.seats.find(s=>s.isAI)){
    t.seats.unshift({username:'__crag__',name:'Crag',ws:null,stack:500,bet:0,hole:[],folded:false,allIn:false,isAI:true,acted:false});
  }
  say(ws,`[ You sit at Crag's poker table with ${stack}g. ]`,'ok');
  _ptBcast(`${p.name} joins the table. (${t.seats.filter(s=>!s.isAI).length} player${t.seats.filter(s=>!s.isAI).length!==1?'s':''} + Crag)`);
  if(t.stage==='waiting'&&t.seats.length>=2){
    if(t.nextTimer)clearTimeout(t.nextTimer);
    _ptBcast('Hand starting in 3 seconds…');
    t.nextTimer=setTimeout(()=>_ptDeal(),3000);
  } else if(t.stage!=='waiting'){
    say(ws,'[ Hand in progress — you join next hand. ]','sys');
  }
  _ptSendState();
}
function _ptDeal(){
  if(!_pt)return;
  const t=_pt;t.nextTimer=null;
  // Remove busted seats (stack=0, not AI) — notify them before removing
  t.seats.forEach(s=>{if(!s.isAI&&s.stack<=0&&s.ws&&s.ws.readyState===1)say(s.ws,'You busted out. Better luck next time.','err');});
  t.seats=t.seats.filter(s=>s.isAI||s.stack>0);
  // Need at least Crag + 1 real (non-spectating) player to deal
  if(t.seats.filter(s=>!s.spectating||s.isAI).length<2){_pt=null;return;}
  // Reset each seat for new hand — spectators become full players
  t.seats.forEach(s=>{s.hole=[];s.bet=0;s.folded=false;s.allIn=false;s.acted=false;s.handName=null;s._ev=null;s.spectating=false;});
  t.deck=_ptDeck();t.community=[];t.pot=0;t.handNum++;
  t.highBet=_PT_BB;t.minRaise=_PT_BB;
  // Advance dealer
  t.dealer=(t.dealer+1)%t.seats.length;
  // Deal 2 hole cards each
  for(let i=0;i<2;i++)t.seats.forEach(s=>s.hole.push(t.deck.pop()));
  // Post blinds
  const sbIdx=(t.dealer+1)%t.seats.length;
  const bbIdx=(t.dealer+2)%t.seats.length;
  _ptPostBlind(sbIdx,_PT_SB);
  _ptPostBlind(bbIdx,_PT_BB);
  t.seats[sbIdx].acted=false;t.seats[bbIdx].acted=false; // can still raise
  t.stage='preflop';
  // First to act: seat after BB
  t.cur=_ptNextActive((bbIdx+1)%t.seats.length);
  t.lastAggressor=bbIdx; // BB is last aggressor preflop if no raise
  _ptBcast(`Hand #${t.handNum} — blinds ${_PT_SB}/${_PT_BB}g.`);
  _ptSendState();
  _ptNextAct();
}
function _ptPostBlind(idx,amt){
  const s=_pt.seats[idx],a=Math.min(amt,s.stack);
  s.stack-=a;s.bet=a;_pt.pot+=a;if(s.stack===0)s.allIn=true;
}
function _ptNextActive(from){
  const t=_pt;let idx=((from%t.seats.length)+t.seats.length)%t.seats.length;
  for(let i=0;i<t.seats.length;i++){
    const s=t.seats[idx];
    if(!s.folded&&!s.allIn&&!s.spectating)return idx;
    idx=(idx+1)%t.seats.length;
  }
  return -1;
}
function _ptRoundOver(){
  const t=_pt;
  // Only count seats that are actually playing this hand (not spectating)
  const active=t.seats.filter(s=>!s.folded&&!s.allIn&&!s.spectating);
  if(active.length<=1)return true;
  return active.every(s=>s.acted&&s.bet>=t.highBet);
}
function _ptNextAct(){
  if(!_pt)return;
  const t=_pt;
  // Check round-over
  if(_ptRoundOver()){_ptAdvance();return;}
  const seat=t.seats[t.cur];
  if(!seat||seat.folded||seat.allIn||seat.spectating){
    t.cur=_ptNextActive((t.cur+1)%t.seats.length);
    _ptNextAct();return;
  }
  if(seat.isAI){
    _ptSendState('Crag is thinking…');
    setTimeout(_ptAiAct,1200);
  } else {
    _ptSendState(`Your turn — call ${Math.max(0,t.highBet-(seat.bet||0))}g, raise, or fold.`);
  }
}
function _ptAiAct(){
  if(!_pt)return;
  const t=_pt;const seat=t.seats[t.cur];
  if(!seat||!seat.isAI)return;
  // Estimate hand strength
  const all=[...seat.hole,...t.community];
  const rankSum=seat.hole.reduce((s,c)=>s+(_PT_RV[c.r]||0),0);
  const paired=seat.hole[0].r===seat.hole[1].r;
  const suited=seat.hole[0].s===seat.hole[1].s;
  let str=rankSum/28+(paired?0.3:0)+(suited?0.1:0);
  if(t.community.length>0){const ev=_ptEvalHand(all);str=Math.max(str,ev.rank/8+Math.random()*0.15);}
  str=Math.max(0,Math.min(1,str+(Math.random()-.4)*0.2));
  const toCall=Math.max(0,t.highBet-(seat.bet||0));
  let act='check',raiseAmt=0;
  if(toCall>0){
    if(str<0.2&&Math.random()>.3)act='fold';
    else if(str>0.65&&Math.random()>.45){act='raise';raiseAmt=Math.min(Math.floor(t.pot*.6+toCall),seat.stack);}
    else act='call';
  } else {
    if(str>0.55&&Math.random()>.4){act='raise';raiseAmt=Math.min(Math.floor(t.pot*.4+_PT_BB),seat.stack);}
    else act='check';
  }
  _ptApplyAct(t.cur,act,raiseAmt);
}
function _ptApplyAct(seatIdx,action,amount){
  if(!_pt)return;
  const t=_pt;const seat=t.seats[seatIdx];
  if(!seat)return;
  seat.acted=true;
  const toCall=Math.max(0,t.highBet-(seat.bet||0));
  let log='';
  if(action==='fold'){seat.folded=true;log=`${seat.name} folds.`;}
  else if(action==='check'){log=`${seat.name} checks.`;}
  else if(action==='call'){
    const a=Math.min(toCall,seat.stack);seat.stack-=a;seat.bet=(seat.bet||0)+a;t.pot+=a;
    if(seat.stack===0)seat.allIn=true;
    log=`${seat.name} calls ${a}g.`;
  } else if(action==='raise'){
    const min=Math.max(t.minRaise,toCall+_PT_BB);
    const a=Math.min(Math.max(amount,min),seat.stack);
    seat.stack-=a;seat.bet=(seat.bet||0)+a;t.pot+=a;
    t.highBet=Math.max(t.highBet,seat.bet);
    t.minRaise=a-toCall;t.lastAggressor=seatIdx;
    if(seat.stack===0)seat.allIn=true;
    // Others need to act again
    t.seats.forEach((s,i)=>{if(i!==seatIdx&&!s.folded&&!s.allIn)s.acted=false;});
    log=`${seat.name} raises to ${seat.bet}g.`;
  }
  // Check if only one non-spectating player left
  const alive=t.seats.filter(s=>!s.folded&&!s.spectating);
  if(alive.length===1){_ptBcast(log);_ptAwardPot([alive[0]]);return;}
  _ptBcast(log);
  // Advance to next seat
  const nextIdx=_ptNextActive((seatIdx+1)%t.seats.length);
  if(nextIdx<0){_ptAdvance();return;}
  t.cur=nextIdx;
  // Do NOT call _ptSendState here — _ptNextAct owns all state delivery
  // to avoid double-send when the round ends immediately after this action
  _ptNextAct();
}
function _ptAdvance(){
  if(!_pt)return;
  const t=_pt;
  if(t.stage==='showdown')return; // guard against re-entrant call
  const stages=['preflop','flop','turn','river','showdown'];
  const idx=stages.indexOf(t.stage);
  // Reset bets for new street
  t.seats.forEach(s=>{s.bet=0;s.acted=false;});
  t.highBet=0;t.minRaise=_PT_BB;
  if(idx>=stages.length-2){_ptShowdown();return;}
  t.stage=stages[idx+1];
  if(t.stage==='flop')for(let i=0;i<3;i++)t.community.push(t.deck.pop());
  else if(t.stage==='turn'||t.stage==='river')t.community.push(t.deck.pop());
  t.cur=_ptNextActive((t.dealer+1)%t.seats.length);
  _ptBcast(`— ${t.stage.charAt(0).toUpperCase()+t.stage.slice(1)} —`);
  _ptSendState();
  _ptNextAct();
}
function _ptShowdown(){
  if(!_pt)return;
  const t=_pt;t.stage='showdown';
  const alive=t.seats.filter(s=>!s.folded&&!s.spectating);
  alive.forEach(s=>{
    const ev=_ptEvalHand([...s.hole,...t.community]);
    s.handName=ev.name;s._ev=ev;
  });
  let best=null;
  alive.forEach(s=>{if(!best||_ptCmp(s._ev,best._ev)>0)best=s;});
  const winners=alive.filter(s=>_ptCmp(s._ev,best._ev)===0);
  const share=Math.floor(t.pot/winners.length);
  winners.forEach(s=>{
    s.stack+=share;
    // Track poker wins/gold for leaderboard
    if(!s.isAI){for(const[,pp] of sessions){if(pp.username===s.username){pp.pokerWins=(pp.pokerWins||0)+1;pp.pokerGold=(pp.pokerGold||0)+share;svc(pp);}}}
  });
  const wMsg=winners.map(s=>`${s.name} (${s.handName})`).join(' & ');
  const potMsg=winners.length>1?`Split pot — ${share}g each`:`${t.pot}g`;
  const resultLine=`🏆 ${wMsg} win${winners.length>1?'':'s'} ${potMsg}!`;
  _ptBcast(resultLine,'ok');
  // Show result prominently inside the modal and keep it for 5s before next deal
  _ptSendState(`SHOWDOWN — ${resultLine} · Next hand in 5s…`);
  setTimeout(_ptKickBusted,2000);
  t.nextTimer=setTimeout(()=>{if(_pt)_ptDeal();},5000);
}
function _ptAwardPot(winners){
  if(!_pt)return;
  const t=_pt;
  const share=Math.floor(t.pot/winners.length);
  winners.forEach(s=>s.stack+=share);
  const wNames=winners.map(s=>s.name).join(' & ');
  const potMsg2=winners.length>1?`Split pot — ${share}g each`:`${t.pot}g`;
  const resultLine2=`🏆 ${wNames} win${winners.length>1?'':'s'} ${potMsg2} — everyone else folded!`;
  _ptBcast(resultLine2,'ok');
  // Show result prominently in modal, next hand in 3s
  _ptSendState(`${resultLine2} · Next hand in 3s…`);
  setTimeout(_ptKickBusted,1500);
  t.nextTimer=setTimeout(()=>{if(_pt)_ptDeal();},3000);
}
function _ptKickBusted(){
  if(!_pt)return;
  const busted=_pt.seats.filter(s=>!s.isAI&&s.stack<=0).map(s=>s.username);
  busted.forEach(u=>_ptKickByName(u,'You are out of chips. Better luck next time — you leave the table.'));
}
function _ptPlayerAct(ws,p,action,amount){
  if(!_pt)return say(ws,'No poker game in progress.','err');
  const t=_pt;
  const seatIdx=t.seats.findIndex(s=>s.username===p.username);
  if(seatIdx<0)return say(ws,"You're not seated at the table. Type CHALLENGE CRAG [gold] to join.",'err');
  if(seatIdx!==t.cur)return say(ws,"It's not your turn.",'err');
  if(t.seats[seatIdx].folded)return say(ws,'You already folded this hand.','err');
  _ptApplyAct(seatIdx,action,amount||0);
}
function _ptLeave(ws,p,kickMsg){
  if(!_pt)return;
  const seat=_pt.seats.find(s=>s.username===p.username);
  if(!seat)return; // not at table
  // Return remaining stack to player's gold
  const cashOut=Math.floor(seat.stack||0);
  if(cashOut>0){p.gold+=cashOut;sidebar(ws,p);svc(p);}
  const net=cashOut-(seat.buyIn||0);
  const leaveText=kickMsg||`You leave the table with ${cashOut}g (${net>=0?'+':''}${net}g).`;
  say(ws,leaveText,'sys');
  // Tell client to close the poker modal
  if(ws&&ws.readyState===WS.OPEN)ws.send(JSON.stringify({type:'poker_kicked',msg:leaveText}));
  _pt.seats=_pt.seats.filter(s=>s.username!==p.username);
  _ptBcast(`${p.name} leaves the table.`);
  if(_pt.seats.filter(s=>!s.isAI).length===0){_pt=null;}
  else _ptSendState();
}
// Kick a player from the table by username (used for bust/disconnect lookup)
function _ptKickByName(username,kickMsg){
  if(!_pt)return;
  for(const[ws,p] of sessions){
    if(p.username===username){_ptLeave(ws,p,kickMsg);return;}
  }
  // Player is offline — just remove the seat
  _pt.seats=_pt.seats.filter(s=>s.username!==username);
  if(_pt.seats.filter(s=>!s.isAI).length===0)_pt=null;
  else _ptSendState();
}
const inRoom = rid => [...sessions.values()].filter(p => p.room === rid && p.loggedIn);
function bRoom(rid, msg, excl=null) {
  for (const [ws, p] of sessions)
    if (p.room===rid && p.loggedIn && ws!==excl && ws.readyState===WS.OPEN)
      ws.send(JSON.stringify(msg));
}
function bAll(msg) {
  if(!sessions)return;
  for (const [ws, p] of sessions)
    if (p.loggedIn && ws.readyState===WS.OPEN)
      ws.send(JSON.stringify(msg));
}
function raw(ws, msg) { if (ws.readyState===WS.OPEN) ws.send(JSON.stringify(msg)); }
function say(ws, text, cls='') { raw(ws, {type:'line', text, cls}); }
function sayRoom(rid, text, cls='', excl=null) { bRoom(rid, {type:'line',text,cls}, excl); }

// ── Room Occupants broadcast ──────────────────────────────────────────────────
function sendRoomOccupants(roomId) {
  const rm = world[roomId];
  if (!rm) return;
  const players = inRoom(roomId).map(p => ({
    name: p.name,
    avatar: p.avatar || null,
    className: p.className || '',
    companions: (p.companions||[]).map(c=>{
      const _slug=COMPANION_PORTRAITS[c.name];
      return {name:c.name, img:_slug?resolveImg('pets',_slug):null, hp:c.hp, maxhp:c.maxhp, atk:c.atk};
    }),
    zombies: (p.zombies||[]).map(z=>({name:z.name}))
  }));
  const npcs = Object.values(NPCS).filter(n => n.room === roomId).map(n => ({
    name: n.name,
    img: n.portraitFile ? resolveImg('npcs', n.portraitFile) : null
  }));
  // Include adventurers: unrecruited ones at their home room, plus any recruited by players in this room
  const _advInRoom = new Map();
  Object.entries(ADVENTURERS).forEach(([k,a])=>{ if(a.room===roomId) _advInRoom.set(k,a); });
  for(const [,pl] of sessions){
    if(pl.room===roomId&&pl.loggedIn&&pl.adventurers){
      pl.adventurers.forEach(a=>{ if(!_advInRoom.has(a.key)&&ADVENTURERS[a.key]) _advInRoom.set(a.key,ADVENTURERS[a.key]); });
    }
  }
  _advInRoom.forEach(a=>npcs.push({name:a.shortName||a.name, img:a.portraitFile?resolveImg('npcs',a.portraitFile):null, isAdventurer:true}));
  const monsters = (rm.monsters || []).filter(m => !m.dead).map(m => {
    const portrait = MOB_PORTRAITS[m.name];
    return { name: m.name, img: portrait ? resolveImg('monsters', portrait) : null, hp: m.hp, maxhp: m.maxhp };
  });
  const items = (rm.items || []).map(item => {
    const key = item.toLowerCase();
    const profImg = ITEM_PROFILES[key]?.img;
    const slug = profImg || key.replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    return { name: item, img: resolveImg('items', slug) };
  });
  const msg = { type:'room_occupants', players, npcs, monsters, items };
  for (const [ws, p] of sessions) {
    if (p.room === roomId && p.loggedIn && ws.readyState === WS.OPEN)
      ws.send(JSON.stringify(msg));
  }
}

// ── Character files ───────────────────────────────────────────────────────
const cf  = u => path.join(CHAR_DIR, u.toLowerCase()+'.json');
const cex = u => fs.existsSync(cf(u));
const ldc = u => { try { if(!fs.existsSync(cf(u)))return null; return JSON.parse(fs.readFileSync(cf(u),'utf8')); } catch { return null; } };
function svc(p) {
  try{
  // Ensure directory exists before writing
  if(!fs.existsSync(CHAR_DIR))fs.mkdirSync(CHAR_DIR,{recursive:true});
  if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});
  fs.writeFileSync(cf(p.username), JSON.stringify({
    username:p.username, passwordHash:p.passwordHash, name:p.name,
    raceId:p.raceId, raceName:p.raceName, classId:p.classId, className:p.className,
    hp:p.hp, maxhp:p.maxhp, atk:p.atk, def:p.def, agi:p.agi||0, gold:p.gold, xp:p.xp, level:p.level,
    inventory:p.inventory, equipped:p.equipped, gearAtk:p.gearAtk, gearDef:p.gearDef,
    room:p.room, cd:p.cd||{}, companion:p.companion||null, zombies:p.zombies||[],
    bio:p.bio||'', avatar:p.avatar||'', achievements:p.achievements||[],
    killCount:p.killCount||0, craftCount:p.craftCount||0,
    zonesVisited:p.zonesVisited||[], guildId:p.guildId||'',
    quests:p.quests||{}, isAdmin:p.isAdmin||false, bagContents:p.bagContents||{}, autoloot:!!p.autoloot, aliases:p.aliases||{}, extraSkills:p.extraSkills||[], companions:(p.companions||[]).filter(c=>c), adventurers:(p.adventurers||[]), npcMemory:(p.npcMemory||{}), metNpcs:(p.metNpcs||{}), explored:(p.explored||[]), arcadeUnlocked:!!p.arcadeUnlocked,
    deathCount:p.deathCount||0, lastKiller:p.lastKiller||'', pokerWins:p.pokerWins||0, pokerGold:p.pokerGold||0,
    reputation:p.reputation||{temple:0,guild:0,miners:0,order:0,shadow:0}
  }, null, 2));
  }catch(e){console.error('[SAVE ERROR]',e.message);}
}

const RTDEF = {
  loggedIn:false, inCombat:false, enemy:null, dead:false, ws:null, agi:0,
  atkBonus:0, sh:{}, cd:{}, backstabUsed:false, partyFollow:false,
  bcT:0, bcV:0, pbT:0, pbD:0, frozenT:0, rageT:0, rageA:0,
  shiftT:0, _shiftActive:false, lichT:0, _lichActive:false,
  consecT:0, regrowthT:0, totemT:0, totemH:0, plagueT:0, plagueD:0,
  curseT:0, curseD:0, darkpactT:0, doomT:0, darkAuraT:0,
  deathmarkT:0, elementalT:0, _elementalActive:false,
  catalystT:0, _catalystActive:false, inspireT:0, _inspireActive:false,
  _darkPactActive:false, _arcaneBladeActive:false,
  regenTimer:900, bio:'', avatar:'', achievements:[], killCount:0, bagContents:{}, autoloot:false, aliases:{}, extraSkills:[],
  craftCount:0, zonesVisited:[], guildId:'', quests:{}, isAdmin:false,
  companion:null, zombies:[], companions:[], adventurers:[], npcMemory:{}, metNpcs:{}, pendingSpec:null,
  deathCount:0, lastKiller:'', pokerWins:0, pokerGold:0,
  reputation:{temple:0,guild:0,miners:0,order:0,shadow:0},
  explored:[], arcadeUnlocked:false
};

function newPlayer(user, pw, name, raceId, classId) {
  const race = RACES[raceId], cls = CLASSES[classId];
  const p = {
    ...RTDEF,
    username:user, passwordHash:hash(pw), name, raceId, raceName:race.name,
    classId, className:cls.name,
    hp:cls.hp+race.hp, maxhp:cls.hp+race.hp,
    atk:cls.atk+race.atk, def:cls.def+race.def, agi:cls.agi+(race.agi||0),
    gold:cls.gold+race.gold, xp:0, level:1,
    inventory:[], equipped:[], gearAtk:0, gearDef:0,
    room:'town_square', cd:{}, companion:null, zombies:[]
  };
  (cls.start||[]).forEach(item => {
    p.inventory.push(item);
    const k = item.toLowerCase();
    if (EQ[k]) doEquip(p, item, true);
  });
  return p;
}
function hydrate(data) {
  // Merge saved data over defaults — ensures all new fields exist
  const p = Object.assign({...RTDEF, companion:null, zombies:[]}, data);

  // ── MIGRATIONS — patch old saves with new required fields ────────────────

  // companions array (added v10.1) — also migrate p.companion if array is empty
  if(!p.companions) p.companions = [];
  if(p.companion && !p.companions.find(c=>c.name===p.companion.name)) p.companions.push(p.companion);
  // adventurer companions (added v11)
  if(!p.adventurers) p.adventurers = [];
  // NPC memory (added v11.1)
  if(!p.npcMemory) p.npcMemory = {};
  // NPC first-visit tracking (added v13)
  if(!p.metNpcs) p.metNpcs = {};
  if(!p.deathCount) p.deathCount = 0;
  if(!p.pokerWins) p.pokerWins = 0;
  if(!p.pokerGold) p.pokerGold = 0;
  if(!p.reputation) p.reputation = {temple:0,guild:0,miners:0,order:0,shadow:0};
  // Explored rooms mini-map (added v12)
  if(!p.explored) p.explored = [];
  // Arcade unlock (added v12.1)
  if(p.arcadeUnlocked===undefined) p.arcadeUnlocked=false;

  // autoloot, aliases, extraSkills (added v10.1)
  if(p.autoloot===undefined) p.autoloot = false;
  if(!p.aliases) p.aliases = {};
  if(!p.extraSkills) p.extraSkills = [];

  // bagContents (added v10.1)
  if(!p.bagContents) p.bagContents = {};

  // agi (added v13) — legacy players get agi from average of atk+def
  if(!p.agi||p.agi===0) p.agi = Math.max(5, Math.floor((p.atk + p.def) / 2));

  // killCount, craftCount, zonesVisited (added v10.1)
  if(!p.killCount) p.killCount = 0;
  if(!p.craftCount) p.craftCount = 0;
  if(!p.zonesVisited) p.zonesVisited = [];

  // achievements (added v10.1)
  if(!p.achievements) p.achievements = [];

  // quests (added v10.1)
  if(!p.quests) p.quests = {};

  // guildId (added v10.1)
  if(p.guildId===undefined) p.guildId = '';

  // bio, avatar (added v10.1)
  if(!p.bio) p.bio = '';
  if(!p.avatar) p.avatar = '';

  // gearAtk / gearDef (added v10.0 — recalculate if missing)
  if(p.gearAtk===undefined || p.gearDef===undefined) {
    p.gearAtk = 0; p.gearDef = 0;
    (p.equipped||[]).forEach(e => {
      const st = EQ[e.toLowerCase()];
      if(st) { p.gearAtk += (st.atk||0); p.gearDef += (st.def||0); }
    });
  }

  // regenTimer (changed v10.2 — reset to 900 if old value)
  if(!p.regenTimer || p.regenTimer < 10) p.regenTimer = 900;

  // room validation — if saved room no longer exists, reset
  if(p.room && !WT[p.room] && !p.room.startsWith('private_') && !p.room.startsWith('hall_') && !p.room.startsWith('vault_') && !p.room.startsWith('storage_') && !p.room.startsWith('bed_')) {
    console.log(`[MIGRATE] Resetting invalid room "${p.room}" for ${p.username}`);
    p.room = 'town_square';
  }

  // pendingSpec cleanup
  if(p.pendingSpec===undefined) p.pendingSpec = null;

  // zombies cleanup — ensure array
  if(!Array.isArray(p.zombies)) p.zombies = [];
  if(!Array.isArray(p.enemiesJoined)) p.enemiesJoined = [];

  // companions sync — keep p.companion in sync with first companion
  p.companion = p.companions[0] || null;

  console.log(`[Hydrate] ${p.username||'?'} — Level ${p.level}, ${(p.companions||[]).length} companions, ${(p.zombies||[]).length} zombies`);
  return p;
}

// Admin account
const ADMIN_USER = 'bound';
const ADMIN_HASH = hash('78945');
function ensureAdmin() {
  try{
  if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});
  if(!fs.existsSync(CHAR_DIR))fs.mkdirSync(CHAR_DIR,{recursive:true});
  // If account exists, just ensure isAdmin and password are always correct
  if (cex(ADMIN_USER)) {
    const existing = ldc(ADMIN_USER);
    if(existing && (!existing.isAdmin || existing.passwordHash !== ADMIN_HASH)) {
      existing.isAdmin = true;
      existing.passwordHash = ADMIN_HASH;
      fs.writeFileSync(cf(ADMIN_USER), JSON.stringify(existing, null, 2));
      console.log('[Boot] Admin account "Bound" credentials refreshed');
    }
    return;
  }
  fs.writeFileSync(cf(ADMIN_USER), JSON.stringify({
    username:ADMIN_USER, passwordHash:ADMIN_HASH, name:'Bound',
    raceId:'celestial', raceName:'Celestial', classId:'templar', className:'Templar',
    hp:9999, maxhp:9999, atk:99, def:99, gold:999999, xp:0, level:99,
    inventory:[], equipped:[], gearAtk:0, gearDef:0, room:'town_square',
    cd:{}, companion:null, zombies:[], bio:'Administrator of Shadowmere.',
    avatar:'', achievements:[], killCount:0, craftCount:0, zonesVisited:[],
    guildId:'', quests:{}, isAdmin:true
  }, null, 2));
  console.log('[Boot] Admin account "Bound" created');
  }catch(e){console.error('[ADMIN SETUP ERROR]',e.message);}
}
ensureAdmin();
console.log('[Boot] Admin ready');

// ── Admin overrides (persist desc/detail edits made in-game) ─────────────
const OVERRIDES_FILE = path.join(DATA_DIR, 'admin_overrides.json');
const OVERRIDES_FILE_SRC = path.join(__dirname, 'data', 'admin_overrides.json');
function loadAdminOverrides(){
  try{
    // On Render first boot: seed from project copy if disk doesn't have it
    if(!fs.existsSync(OVERRIDES_FILE) && fs.existsSync(OVERRIDES_FILE_SRC)){
      fs.copyFileSync(OVERRIDES_FILE_SRC, OVERRIDES_FILE);
      console.log('[Boot] Seeded admin_overrides.json from project to disk');
    }
    const ov=JSON.parse(fs.readFileSync(OVERRIDES_FILE,'utf8'));
    // Apply room overrides
    if(ov.rooms) Object.entries(ov.rooms).forEach(([id,v])=>{
      if(world[id]){if(v.desc)world[id].desc=v.desc;}
      if(v.detail||v.img){if(!ROOM_PROFILES[id])ROOM_PROFILES[id]={};
        if(v.detail)ROOM_PROFILES[id].detail=v.detail;
        if(v.img)ROOM_PROFILES[id].img=v.img;}
    });
    // Apply NPC overrides
    if(ov.npcs) Object.entries(ov.npcs).forEach(([id,v])=>{
      if(NPCS[id]){if(v.desc)NPCS[id].desc=v.desc;if(v.greeting)NPCS[id].greeting=v.greeting;}
    });
    console.log('[Boot] Admin overrides loaded');
  }catch(e){}
}
function saveAdminOverrides(section,id,data){
  let ov={rooms:{},npcs:{}};
  try{ov=JSON.parse(fs.readFileSync(OVERRIDES_FILE,'utf8'));}catch(e){}
  if(!ov[section])ov[section]={};
  ov[section][id]=Object.assign(ov[section][id]||{},data);
  fs.writeFileSync(OVERRIDES_FILE,JSON.stringify(ov,null,2));
}
loadAdminOverrides();

// ── Dynamic world content (Wonder/Admin-created rooms) ────────────────────
const DYN_PATH = path.join(DATA_DIR,'world_dynamic.json');
function loadDynamic(includeNpcs) {
  try {
    const d = JSON.parse(fs.readFileSync(DYN_PATH,'utf8'));
    let r=0;
    if(d.rooms) { Object.entries(d.rooms).forEach(([k,v])=>{ world[k]=v; r++; }); }
    if(d.wt)    { Object.entries(d.wt).forEach(([k,v])=>{ WT[k]=v; }); }
    if(includeNpcs && d.npcs) { Object.entries(d.npcs).forEach(([k,v])=>{ NPCS[k]=v; }); }
    // Restore dynamic items → EQ + ITEM_PROFILES
    if(d.items) {
      Object.entries(d.items).forEach(([k,v])=>{
        if(!EQ[k])           EQ[k]           = {t:v.t||'misc', atk:v.atk||0, def:v.def||0, desc:v.desc||''};
        if(!ITEM_PROFILES[k]) ITEM_PROFILES[k] = {img:v.img||k.replace(/[^a-z0-9]+/g,'_'), desc:v.desc||''};
      });
    }
    // Restore dynamic shops
    if(d.shops) { Object.entries(d.shops).forEach(([k,v])=>{ if(!SHOPS[k]) SHOPS[k]=v; }); }
    // Re-apply Wonder connector exits to static rooms (exits added when Wonder linked a dynamic area)
    let connectorCount = 0;
    if(d.connectors) { d.connectors.forEach(c=>{ if(world[c.staticRoom]&&!world[c.staticRoom].exits[c.dir]){ world[c.staticRoom].exits[c.dir]=c.dest; connectorCount++; } }); }
    if(r) console.log(`[Boot] world_dynamic: ${r} dynamic room(s), ${Object.keys(d.items||{}).length} items, ${connectorCount} connector exits restored`);
  } catch(e){}
}
function saveDynamic() {
  const out={rooms:{},wt:{},npcs:{},items:{},shops:{},connectors:[]};
  Object.entries(world).forEach(([k,v])=>{ if(v._dynamic) out.rooms[k]=v; });
  Object.entries(WT).forEach(([k,v])=>{ if(world[k]?._dynamic) out.wt[k]=v; });
  Object.entries(NPCS).forEach(([k,v])=>{ if(v._dynamic) out.npcs[k]=v; });
  // Persist dynamic items (registered via Wonder)
  Object.entries(EQ).forEach(([k,v])=>{ if(v._dynamic) out.items[k]={...v, img:ITEM_PROFILES[k]?.img||k.replace(/[^a-z0-9]+/g,'_')}; });
  // Persist dynamic shops
  Object.entries(SHOPS).forEach(([k,v])=>{ if(v._dynamic) out.shops[k]=v; });
  // Persist connector exits Wonder added to static rooms (so they survive restarts)
  if (_WND && _WND._connectors) out.connectors = _WND._connectors;
  try { fs.writeFileSync(DYN_PATH,JSON.stringify(out,null,2)); }
  catch(e){ console.log('[Dynamic] Save error:',e.message); }
}
loadDynamic(false); // rooms + WT now; NPCs after NPCS const is defined (in Wonder startup)

// ── Explore Zones (admin/Wonder-generated sub-areas) ─────────────────────────
const EZ_FILE = path.join(DATA_DIR, 'explore_zones.json');
const EZ_FILE_SRC = path.join(__dirname, 'data', 'explore_zones.json');
let _ezData = {tiles:{}, rooms:{}, items:{}};
function loadExploreZones(){
  try{
    // On Render first boot: disk won't have the file yet — seed from project copy
    if(!fs.existsSync(EZ_FILE) && fs.existsSync(EZ_FILE_SRC)){
      fs.copyFileSync(EZ_FILE_SRC, EZ_FILE);
      console.log('[Boot] Seeded explore_zones.json from project to disk');
    }
    _ezData = JSON.parse(fs.readFileSync(EZ_FILE,'utf8'));
    // Merge explore zone rooms into world
    Object.entries(_ezData.rooms||{}).forEach(([k,v])=>{ world[k]=v; });
    // Restore explore pointers on surface tiles
    let linked=0;
    Object.entries(_ezData.tiles||{}).forEach(([tileId,entryId])=>{
      if(world[tileId]){ world[tileId].explore=entryId; linked++; }
      else console.warn(`[ExploreZone] Tile not found in world: ${tileId}`);
    });
    // Restore custom items
    Object.entries(_ezData.items||{}).forEach(([k,v])=>{ if(!EQ[k]) EQ[k]={t:v.t||'item',atk:v.atk||0,def:v.def||0,desc:v.desc||''}; });
    const rc=Object.keys(_ezData.rooms||{}).length;
    if(rc) console.log(`[Boot] Explore zones: ${linked} tiles linked, ${rc} rooms, ${Object.keys(_ezData.items||{}).length} items`);
  }catch(e){
    if(e.code!=='ENOENT') console.error('[ExploreZone] Load error:',e.message);
  }
}
function saveExploreZones(){
  try{ fs.writeFileSync(EZ_FILE, JSON.stringify(_ezData,null,2)); }
  catch(e){ console.error('[ExploreZone] Save error',e.message); }
}
loadExploreZones();


// ── Equip helpers ─────────────────────────────────────────────────────────
function doEquip(p, name, silent) {
  const k = name.toLowerCase(), st = EQ[k];
  if (!st) return false;
  if (p.equipped.includes(name)) return false;
  // Bags don't replace other items — multiple bags allowed
  if (st.t !== 'bag') {
    const old = p.equipped.find(e => {
      const es = EQ[e.toLowerCase()];
      return es && es.t === st.t;
    });
    if (old) doUnequip(p, old, true);
  }
  p.equipped.push(name);
  p.inventory = p.inventory.filter(i => i !== name);
  p.atk += (st.atk||0); p.def += (st.def||0);
  p.gearAtk += (st.atk||0); p.gearDef += (st.def||0);
  return true;
}
function doUnequip(p, name, silent) {
  const i = p.equipped.indexOf(name); if (i === -1) return false;
  const st = EQ[name.toLowerCase()];
  p.equipped.splice(i, 1); p.inventory.push(name);
  if (st) { p.atk-=(st.atk||0); p.def-=(st.def||0); p.gearAtk-=(st.atk||0); p.gearDef-=(st.def||0); }
  return true;
}

// ── Regen tick — full heal every 15 minutes ─────────────────────────────
const REGEN_SECS = 15 * 60; // 900 seconds = 15 minutes
setInterval(() => {
  for (const [ws, p] of sessions) {
    if (!p.loggedIn || p.dead) continue;
    if (p.regenTimer === undefined) p.regenTimer = REGEN_SECS;
    p.regenTimer--;
    if (p.regenTimer <= 0) {
      p.regenTimer = REGEN_SECS;
      if (p.hp < p.maxhp) {
        p.hp = p.maxhp;
        say(ws, `[ ✦ Natural rest — HP fully restored! HP: ${p.hp}/${p.maxhp} ]`, 'ok');
        sidebar(ws, p);
      }
    }
    // Update regen bar every 30 seconds
    if (p.regenTimer % 30 === 0) raw(ws, {type:'regen', secs:p.regenTimer, max:REGEN_SECS});
  }
}, 1000);

// ── Sidebar ───────────────────────────────────────────────────────────────
function sidebar(ws, p) {
  const cls = CLASSES[p.classId]||{};
  const skills = (cls.skills||[]).map(sid => {const sk=SK[sid]||{}; return {name:sk.n||sid, cd:(p.cd||{})[sid]||0};});
  const myParty = getParty(p.username);
  let partyData = null;
  if (myParty) {
    const party = parties.get(myParty.id);
    if (party) partyData = [...party.members].map(u => {
      const m = [...sessions.values()].find(x => x.username===u&&x.loggedIn);
      return m ? {name:m.name, level:m.level, isLeader:party.leader===u, following:!!m.partyFollow} : null;
    }).filter(Boolean);
  }
  const g = p.guildId ? guilds[p.guildId] : null;
  raw(ws, {
    type:'sidebar', name:p.isAdmin?p.name+' ★':p.name,
    className:p.className, raceName:p.raceName||'', level:p.level,
    hp:p.hp, maxhp:p.maxhp, xp:p.xp, xpNext:xpToLevel(p.level),
    gold:p.gold, atk:p.atk, def:p.def, agi:p.agi||0,
    room:world[p.room]?.name||p.room, zone:world[p.room]?.zone||'',
    equipped:(p.equipped||[]).map(n=>({name:n,img:itemImg(n)})),
    inventory:(()=>{
      // Build set of quest-fetch items for active quests
      const _qmap={'missing_merchant':["aldwyn's satchel"],'mira_herbs':['swamp herb'],'aldric_relic':['ancient rune'],'pip_runaway':['storm feather'],'torvar_materials':['obsidian shard'],'elyndra_tome':['ancient tome'],'sister_maren_roots':['deepwood root'],'vex_ledger':['stolen ledger'],'nessa_locket':["nessa's locket"]};
      const _qi=new Set();
      Object.entries(p.quests||{}).forEach(([qid,st])=>{if(st==='active'&&_qmap[qid])_qmap[qid].forEach(i=>_qi.add(i.toLowerCase()));if(st==='active'){const q=QUESTS[qid];if(q&&q.consume)q.consume.forEach(i=>_qi.add(i.toLowerCase()));}});
      const c={};(p.inventory||[]).forEach(i=>{c[i]=(c[i]||0)+1;});
      return Object.entries(c).map(([n,x])=>{
        const eq=EQ[n.toLowerCase()];
        const t=_qi.has(n.toLowerCase())?'quest':(eq?.t||'item');
        return {name:n,count:x,img:itemImg(n),t};
      }).sort((a,b)=>a.name.localeCompare(b.name));
    })(),
    skills,
    inCombat:p.inCombat, shopNearby:!!(world[p.room]?.shop),
    hasExplore:!!(world[p.room]?.explore), inExploreZone:!!(world[p.room]?.exploreZone),
    shrineNearby:!!(world[p.room]?.teleport)||(world[p.room]?.exits&&Object.values(world[p.room].exits).some(r=>world[r]?.teleport)),
    companion:p.companion?{name:p.companion.name,hp:p.companion.hp,atk:p.companion.atk,maxhp:p.companion.maxhp}:null,
    companions:(p.companions||[]).map(c=>({name:c.name,hp:c.hp,atk:c.atk,maxhp:c.maxhp})),
    adventurers:(p.adventurers||[]).map(a=>({name:a.name,hp:a.hp,atk:a.atk,maxhp:a.maxhp,title:ADVENTURERS[a.key]?.title||'Adventurer',level:a.level||1,xp:a.xp||0,xpNext:advLevelXp(a.level||1),resting:!!a.resting})),
    reputation:p.reputation||{temple:0,guild:0,miners:0,order:0,shadow:0},
    companionSlots:maxCompanions(p),
    zombieSlots:maxZombies(p),
    zombieCount:(p.zombies||[]).length,
    party:partyData, partyFollow:!!p.partyFollow,
    quests:p.quests||{},
    questDetails: Object.entries(p.quests||{}).map(([qid,status])=>{
      const q = QUESTS[qid] || Object.values(QUEST_CHAINS).find(c=>c.id===qid);
      if(!q) return null;
      const rw=[q.reward?.gold?q.reward.gold+'g':'',q.reward?.xp?q.reward.xp+' XP':'',q.reward?.item||'',q.reward?.pet?q.reward.pet.name+' (companion)':''].filter(Boolean).join(', ');
      return {id:qid, status, title:q.title, obj:q.obj||'', reward:rw, giver:q.giver||''};
    }).filter(Boolean),
    guildName:g?g.name:null, guildMembers:g?g.members.length:0, guildBank:g?g.bank:0,
    isAdmin:!!p.isAdmin, roomId:p.room,
    mapData:p.isAdmin ? buildAdminMapData(p) : buildMapData(p)
  });
  // Automatically push Wonder status to admins on every sidebar update
  if(p.isAdmin){try{raw(ws,wonderStatusData());}catch(e){console.error('[Wonder sidebar push]',e.message);}}
}

// ── Mini-map BFS layout ───────────────────────────────────────────────────
function buildMapData(p) {
  const CARD = {north:[0,-1], south:[0,1], east:[1,0], west:[-1,0]};
  // up/down: preferred offset + fallback search order so they always find a free cell
  const VERT = {
    up:   [[0,-1],[-1,-1],[1,-1],[0,-2],[-1,0],[1,0]],
    down: [[0, 1],[-1, 1],[1, 1],[0, 2],[-1,0],[1,0]],
  };
  const rooms = new Map();   // roomKey → {x, y, viaVertical}
  const posUsed = new Set();
  const queue = [{room:p.room, x:0, y:0, depth:0}];
  rooms.set(p.room, {x:0, y:0});
  posUsed.add('0,0');
  const visited = new Set([p.room]);
  while (queue.length) {
    const {room, x, y, depth} = queue.shift();
    if (depth >= 8) continue;  // deeper scan to reach more zones
    const rm = world[room];
    if (!rm || !rm.exits) continue;
    for (const [dir, nextRoom] of Object.entries(rm.exits)) {
      if (!world[nextRoom] || visited.has(nextRoom)) continue;
      let nx, ny, viaVertical = false;
      if (CARD[dir]) {
        [nx, ny] = [x + CARD[dir][0], y + CARD[dir][1]];
        if (posUsed.has(`${nx},${ny}`)) continue;
      } else if (VERT[dir]) {
        viaVertical = true;
        let placed = false;
        for (const [fdx, fdy] of VERT[dir]) {
          const tnx = x + fdx, tny = y + fdy;
          if (!posUsed.has(`${tnx},${tny}`)) { nx=tnx; ny=tny; placed=true; break; }
        }
        if (!placed) continue;
      } else continue;
      visited.add(nextRoom);
      posUsed.add(`${nx},${ny}`);
      rooms.set(nextRoom, {x:nx, y:ny, viaVertical});
      queue.push({room:nextRoom, x:nx, y:ny, depth:depth+1});
    }
  }
  const exploredSet = new Set(p.explored || []);
  const result = [];
  for (const [roomKey, pos] of rooms.entries()) {
    const rm = world[roomKey] || {};
    result.push({
      id: roomKey,
      x: pos.x, y: pos.y,
      viaVertical: pos.viaVertical || false,
      name: rm.name || roomKey,
      zone: rm.zone || '',
      tileImg: rm.tileImg || null,
      explored: exploredSet.has(roomKey),
      current: roomKey === p.room,
      exits: Object.keys(rm.exits||{}),
      hasMonsters: !!(rm.monsters||[]).some(m=>!m.dead),
      hasShop: !!rm.shop,
      hasInn: !!rm.inn,
      mineable: !!rm.mineable,
      teleport: !!rm.teleport,
      hasBoss: !!(rm.monsters||[]).some(m=>!m.dead&&(m.xp||0)>=200)
    });
  }
  return result;
}

/** Full world map for World view button — BFS from town_square with no depth limit,
 *  includes up/down exits. Marks rooms as explored based on player's explored set. */
function buildFullMapData(p) {
  const CARD = {north:[0,-1], south:[0,1], east:[1,0], west:[-1,0]};
  const VERT = {
    up:   [[0,-1],[-1,-1],[1,-1],[0,-2],[-1,0],[1,0]],
    down: [[0, 1],[-1, 1],[1, 1],[0, 2],[-1,0],[1,0]],
  };
  const startRoom = world['town_square'] ? 'town_square' : Object.keys(world)[0];
  const rooms = new Map();
  const posUsed = new Set();
  const queue = [{room:startRoom, x:0, y:0}];
  rooms.set(startRoom, {x:0, y:0, viaVertical:false});
  posUsed.add('0,0');
  const visited = new Set([startRoom]);
  while (queue.length) {
    const {room, x, y} = queue.shift();
    const rm = world[room];
    if (!rm || !rm.exits) continue;
    for (const [dir, nextRoom] of Object.entries(rm.exits)) {
      if (!world[nextRoom] || visited.has(nextRoom)) continue;
      let nx, ny, viaVertical = false;
      if (CARD[dir]) {
        [nx, ny] = [x + CARD[dir][0], y + CARD[dir][1]];
        if (posUsed.has(`${nx},${ny}`)) continue;
      } else if (VERT[dir]) {
        viaVertical = true;
        let placed = false;
        for (const [fdx, fdy] of VERT[dir]) {
          const tnx = x + fdx, tny = y + fdy;
          if (!posUsed.has(`${tnx},${tny}`)) { nx=tnx; ny=tny; placed=true; break; }
        }
        if (!placed) continue;
      } else continue;
      visited.add(nextRoom);
      posUsed.add(`${nx},${ny}`);
      rooms.set(nextRoom, {x:nx, y:ny, viaVertical});
      queue.push({room:nextRoom, x:nx, y:ny});
    }
  }
  const exploredSet = p ? new Set(p.explored||[]) : new Set();
  const result = [];
  for (const [roomKey, pos] of rooms.entries()) {
    const rm = world[roomKey] || {};
    result.push({
      id: roomKey,
      x: pos.x, y: pos.y,
      viaVertical: pos.viaVertical,
      name: rm.name || roomKey,
      zone: rm.zone || '',
      explored: p ? exploredSet.has(roomKey) : true,
      current: p ? roomKey === p.room : false,
      exits: Object.keys(rm.exits||{}),
      hasMonsters: !!(rm.monsters||[]).some(m=>!m.dead),
      hasShop: !!rm.shop,
      hasInn: !!rm.inn,
      mineable: !!rm.mineable,
      teleport: !!rm.teleport,
      hasBoss: !!(rm.monsters||[]).some(m=>!m.dead&&(m.xp||0)>=200)
    });
  }
  return result;
}

/** Full world map for admins — no depth limit, every room marked explored */
function buildAdminMapData(p) {
  const DIRS = {north:[0,-1], south:[0,1], east:[1,0], west:[-1,0]};
  const rooms = new Map();
  const posUsed = new Set();
  const queue = [{room:p.room, x:0, y:0}];
  rooms.set(p.room, {x:0, y:0});
  posUsed.add('0,0');
  const visited = new Set([p.room]);
  while (queue.length) {
    const {room, x, y} = queue.shift();
    const rm = world[room];
    if (!rm || !rm.exits) continue;
    for (const [dir, nextRoom] of Object.entries(rm.exits)) {
      if (!DIRS[dir] || !world[nextRoom]) continue;
      if (visited.has(nextRoom)) continue;
      const [dx, dy] = DIRS[dir];
      const nx = x + dx, ny = y + dy;
      const pk = `${nx},${ny}`;
      if (posUsed.has(pk)) continue;
      visited.add(nextRoom);
      posUsed.add(pk);
      rooms.set(nextRoom, {x:nx, y:ny});
      queue.push({room:nextRoom, x:nx, y:ny});
    }
  }
  const result = [];
  for (const [roomKey, pos] of rooms.entries()) {
    const rm = world[roomKey] || {};
    result.push({
      id: roomKey,
      x: pos.x, y: pos.y,
      name: rm.name || roomKey,
      zone: rm.zone || '',
      explored: true,           // admins see entire world revealed
      current: roomKey === p.room,
      exits: Object.keys(rm.exits||{}),
      hasMonsters: !!(rm.monsters||[]).some(m=>!m.dead),
      hasShop: !!rm.shop,
      hasInn: !!rm.inn,
      mineable: !!rm.mineable,
      teleport: !!rm.teleport,
      hasBoss: !!(rm.monsters||[]).some(m=>!m.dead&&(m.xp||0)>=200),
      hasExplore: !!rm.explore
    });
  }
  return result;
}

// ── Room visual data (for graphical client) ───────────────────────────────
function sendRoomVisual(ws, p) {
  const rm = world[p.room]; if (!rm) return;
  const npcsHere = Object.values(NPCS).filter(n => n.room === p.room);
  const myAdvKeys = new Set((p.adventurers||[]).map(a=>a.key));
  const advsHere = Object.entries(ADVENTURERS)
    .filter(([k,a]) => a.room===p.room && !myAdvKeys.has(k))
    .map(([k,a]) => ({name:a.name, title:a.title, portrait:a.portraitFile||(a.portrait+'.jpg'), recruitable:true}));
  const rp = ROOM_PROFILES[p.room] || {};
  raw(ws, {
    type:'room_visual',
    roomId: p.room,
    img: rp.img ? resolveImg('rooms', rp.img) : null,
    name: rm.name,
    zone: rm.zone,
    desc: rm.desc,
    detail: rp.detail || '',
    atmosphere: rp.atmosphere || '',
    exits: rm.exits || {},
    npcs: [
      ...npcsHere.map(n=>({name:n.name, title:n.title, portrait:n.portraitFile||(n.portrait+'.jpg'), img:n.portraitFile?resolveImg('npcs',n.portraitFile):null, desc:n.desc||'', greeting:n.greeting||'', recruitable:false, gameChallenge:n.gameChallenge?{game:n.gameChallenge.game,title:n.gameChallenge.title,hint:n.gameChallenge.hint}:null})),
      ...advsHere
    ],
    monsters: (rm.monsters||[]).filter(m=>!m.dead).map(m=>{
      const _p=MOB_PORTRAITS[m.name];
      return { id:m.id, name:m.name, img:_p?resolveImg('monsters',_p):null, hp:m.hp, maxhp:m.maxhp, atk:m.atk||0, def:m.def||0, xp:m.xp||0 };
    }),
    items: rm.items || [],
    itemProfiles: (rm.items||[]).reduce((acc,name)=>{
      const p=ITEM_PROFILES[name.toLowerCase()]; if(p)acc[name]={...p,img:p.img?resolveImg('items',p.img):null}; return acc;
    },{}),
    playersHere: inRoom(p.room).filter(o=>o.username!==p.username).map(o=>({name:o.name,level:o.level,className:o.className||'',raceName:o.raceName||''})),
    shop:!!rm.shop, mineable:!!rm.mineable, inn:!!rm.inn, teleport:!!rm.teleport, teleportType:rm.teleport||false,
    hasExplore:!!rm.explore, inExploreZone:!!rm.exploreZone,
    arcadeRoom:!!rm.arcadeRoom, trailRoom:!!rm.trailRoom, c64Room:!!rm.c64Room, theaterRoom:!!rm.theaterRoom,
    ambient:rm.ambient||null,
    inCombat: !!p.inCombat,
    enemy: p.enemy ? {name:p.enemy.name, hp:p.enemy.hp, maxhp:p.enemy.maxhp} : null
  });
}

// ── Room description ──────────────────────────────────────────────────────
function describeRoom(ws, p) {
  const rm = world[p.room]; if (!rm) return;
  // Track explored rooms for mini-map
  if (!p.explored) p.explored = [];
  if (!p.explored.includes(p.room)) p.explored.push(p.room);
  say(ws, '');
  say(ws, `— ${rm.zone} —`, 'zone');
  say(ws, `[ ${rm.name} ]`, 'room');
  say(ws, rm.desc, 'desc');
  const others = inRoom(p.room).filter(o => o.username !== p.username);
  if (others.length) say(ws, `  Players: ${others.map(o=>`${o.name} the ${o.raceName} ${o.className}`).join(', ')}`, 'players');
  // NPCs
  const npcsHere = Object.values(NPCS).filter(n => n.room === p.room);
  if (npcsHere.length) {
    npcsHere.forEach(n => {
      const idle = Math.random()<0.3&&n.idle?.length ? ' '+n.idle[rnd(0,n.idle.length-1)] : '';
      say(ws, `  💬 ${n.name} (${n.title}) is here.${idle}`, 'narrate');
    });
    say(ws, '  Type TALK [name] to speak with them.', 'sys');
  }
  // Adventurer NPCs at their home room (if not already recruited by this player)
  const myAdvKeys = new Set((p.adventurers||[]).map(a=>a.key));
  const advsHere = Object.entries(ADVENTURERS).filter(([k,a])=>a.room===p.room&&!myAdvKeys.has(k));
  if(advsHere.length){
    advsHere.forEach(([,a])=>say(ws,`  ⚔️  ${a.name} (${a.title}) is here.`, 'narrate'));
    say(ws,'  RECRUIT [name] to bring them along on your adventure.','sys');
  }
  (rm.monsters||[]).filter(m=>!m.dead).forEach(m => say(ws, `  ⚔  ${m.name} [HP:${m.hp}/${m.maxhp}]`, 'combat'));
  if (p.zombies&&p.zombies.length) say(ws, `  🧟 Zombies: ${p.zombies.map(z=>z.name).join(', ')}`, 'narrate');
  const _showComps=p.companions&&p.companions.length?p.companions:(p.companion?[p.companion]:[]);
  if(_showComps.length)_showComps.forEach(c=>say(ws,`  🐾 ${c.name} [HP:${c.hp}/${c.maxhp} ATK:${c.atk}]`,'narrate'));
  if(p.adventurers&&p.adventurers.length)p.adventurers.forEach(a=>say(ws,`  🗡️  ${a.name} [HP:${a.hp}/${a.maxhp} ATK:${a.atk}] — with you`,'narrate'));
  if (rm.items&&rm.items.length) say(ws, `  Items: ${rm.items.join(', ')}`, 'loot');
  if (rm.shop) say(ws, '  🛒 Shop here — SHOP to browse.', 'shop');
  if (rm.teleport==='ashford') say(ws,"  ✦ Wayfarer's Shrine — SHRINE to see frontier destinations, TELEPORT [A-F] to travel.",'skill');
  else if (rm.teleport) say(ws, '  ✦ Adventure Shrine — SHRINE to see destinations, TELEPORT [1-8] to travel.', 'skill');
  if (rm.moleTip) say(ws, '  🗺️  The Map Mole is here — TRAVEL to see destinations and prices.', 'skill');
  if (rm.arcadeRoom) say(ws, '  🏹 Three cabinets glow: PLAY INVADERS (Orc Invaders), PLAY BREAKOUT (Dragon Battle), PLAY SNAKE (Dragon\'s Greed).  Passages west, east, and north.', 'skill');
  if (rm.trailRoom) say(ws, '  🐂 The trail awaits — PLAY to begin The Oregon Trail.', 'skill');
  if (rm.c64Room)   say(ws, '  💾 The C64 is loaded — BOOT to play the classic games.', 'skill');
  if (rm.theaterRoom) {
    if (_theaterNowPlaying) {
      const _tfNames={bagdad24:'The Thief of Bagdad (1924)',bagdad40:'The Thief of Bagdad (1940)',sinbad:'The Magic Voyage of Sinbad',alibaba:'Ali Baba and the Forty Thieves',jason:'Jason and the Argonauts',wizards:'Wizards'};
      const _tel=Math.floor((Date.now()-_theaterNowPlaying.startedAt)/1000);
      const _tm=Math.floor(_tel/60),_ts=String(_tel%60).padStart(2,'0');
      say(ws,`  🎬 NOW SHOWING: ${_tfNames[_theaterNowPlaying.filmId]||_theaterNowPlaying.filmId} — ${_tm}m ${_ts}s in.  Type WATCH to join the audience.`,'skill');
    } else {
      say(ws,"  🎬 The Phantom Cinema — LISTINGS to see what's showing, WATCH [title] to start a film.",'skill');
    }
  }
  {const _gNpc=Object.values(NPCS).find(n=>n.room===p.room&&n.gameChallenge);if(_gNpc)say(ws,`  🎲 ${_gNpc.name} is here — ${_gNpc.gameChallenge.hint}`,'skill');}
  if (rm.guildDistrict) {
    const gl = Object.values(guilds);
    if (gl.length) say(ws, `  Active guilds: ${gl.map(g=>g.name).join(', ')}`, 'loot');
  }
  if (rm.guildHallRow) {
    const gl = Object.values(guilds);
    if (gl.length) say(ws, `  Guild halls: ${gl.map(g=>g.name).join(', ')} — GUILDHALL to enter yours.`, 'loot');
  }
  say(ws, `  Exits: ${Object.keys(rm.exits||{}).join(', ')}`, 'exits');
  // Send structured room data to graphical client
  sendRoomVisual(ws, p);
  // Broadcast occupants strip to everyone in the room (including arriving player)
  setImmediate(()=>sendRoomOccupants(p.room));
}

// ── Consumables ───────────────────────────────────────────────────────────
function useConsumable(ws, p, name) {
  const lc = name.toLowerCase();
  const heal = n => { const h=Math.min(n,p.maxhp-p.hp); p.hp+=h; say(ws,`+${n>=9999?p.maxhp:h} HP restored. [${p.hp}/${p.maxhp}]`,'ok'); return true; };
  if (lc==='healing potion') return heal(20);
  if (lc==='greater heal') return heal(50);
  if (lc==='full restore'||lc==='phoenix draught') return heal(9999);
  if (lc==='strength tonic') { p.atk+=3; say(ws,'ATK permanently +3!','ok'); return true; }
  if (lc==='iron skin draught') { p.def+=2; say(ws,'DEF permanently +2!','ok'); return true; }
  if (lc==='elixir of power') { p.atk+=8; say(ws,'ATK permanently +8!','ok'); return true; }
  if (lc==='elixir of stone') { p.def+=8; say(ws,'DEF permanently +8!','ok'); return true; }
  if (lc==='antidote') { say(ws,'Cleansed.','ok'); return true; }
  if (lc==='swamp herb') return heal(8);
  if (lc==='focus elixir') { heal(10); p.atkBonus=(p.atkBonus||0)+1; say(ws,'+10 HP, +1 ATK next hit.','ok'); return true; }
  return false;
}


// ── Taming ────────────────────────────────────────────────────────────────
function doTame(ws, p) {
  if(!p.companions) p.companions = [];
  if(p.companion && !p.companions.find(c=>c.name===p.companion.name)) p.companions.push(p.companion);
  const maxC = maxCompanions(p);
  if (p.companions.length >= maxC) {
    say(ws, `You can control ${maxC} companion${maxC>1?'s':''} at Level ${p.level}. (Gain +1 slot every 10 levels.) DISMISS [name] to release one.`, 'err');
    return;
  }
  const rm = world[p.room];
  // Can tame in combat (current enemy) or from room monsters
  let tgt = p.inCombat && p.enemy && TAMEABLE[p.enemy.name] ? p.enemy
    : (rm.monsters||[]).find(m => !m.dead && TAMEABLE[m.name]);
  if (!tgt) return say(ws, 'No tameable creatures here.', 'err');
  const td = TAMEABLE[tgt.name];
  // Level requirement check
  if ((p.level||1) < (td.levelReq||1)) {
    return say(ws, `You need Level ${td.levelReq} to tame a ${tgt.name}. You are Level ${p.level}.`, 'err');
  }
  const ti = p.inventory.findIndex(i => i.toLowerCase()==='beast treat');
  if (ti===-1) return say(ws, 'Need a Beast Treat (buy at Apothecary, 15g).', 'err');
  const chance = 35 + (p.classId==='beastmaster'?35:0) + (p.raceId==='beastkin'?25:0);
  p.inventory.splice(ti, 1);
  if (rnd(1,100) <= chance) {
    const newComp = {name:tgt.name, atk:td.atk, hp:td.hp, maxhp:td.hp};
    p.companions.push(newComp);
    p.companion = p.companions[0]; // backwards compat for sidebar
    rm.monsters = (rm.monsters||[]).filter(m => m !== tgt);
    if (p.inCombat && p.enemy === tgt) {
      p.inCombat = false; p.enemy = null;
      say(ws, `You offer the treat. The ${tgt.name} stills... then bows its head. Combat ends.`, 'narrate');
    } else {
      say(ws, `You offer the treat slowly. The ${tgt.name} sniffs it... then nuzzles your hand.`, 'narrate');
    }
    say(ws, `✓ ${tgt.name} is now your loyal companion! [ATK:${newComp.atk} HP:${newComp.hp}]`, 'ok');
    say(ws, `  ${p.companions.length}/${maxC} companion slot${maxC>1?'s':''} used. DISMISS [name] to release.`, 'sys');
    sayRoom(p.room, `${p.name} tames a ${tgt.name}!`, 'narrate', ws);
    checkAch(ws, p, 'tamer');
  } else {
    say(ws, `The ${tgt.name} sniffs the treat but backs away. Beast Treat consumed.`, 'err');
  }
  sidebar(ws, p);
}

// ── Raise dead ────────────────────────────────────────────────────────────
function doRaiseDead(ws, p) {
  if (!p.zombies) p.zombies = [];
  const maxZ = maxZombies(p);
  if (p.zombies.length >= maxZ) {
    say(ws, `You can only control ${maxZ} zombie${maxZ>1?'s':''} at Level ${p.level}. (Gain another slot every 10 levels). Release one with DISMISS ZOMBIE [#].`, 'err');
    return;
  }
  const rm = world[p.room];
  if(!rm.corpses) rm.corpses=[];
  const corpse = rm.corpses.find(c=>!c.raised) || (rm.monsters||[]).find(m=>m.dead&&!m.raised);
  if (!corpse) return say(ws, 'No unraised corpses here. Kill something first, then Raise Dead.', 'err');
  // Level check — can only raise enemies equal or lower level (approx by XP)
  const corpseLevel = Math.max(1, Math.floor((corpse.xp||20) / 50));
  if (corpseLevel > (p.level||1)) {
    say(ws, `This creature is too powerful to raise. You need Level ${corpseLevel}+ to animate a ${corpse.name}.`, 'err');
    return;
  }
  corpse.raised = true;
  // Zombies have exactly HALF the original monster's HP
  const zHp = Math.max(5, Math.floor((corpse.maxhp||20) * 0.5));
  const zAtk = Math.max(1, Math.floor((corpse.atk||5) * 0.65));
  const z = {name:`Zombie ${corpse.name}`, hp:zHp, maxhp:zHp, atk:zAtk, srcLevel:corpseLevel};
  p.zombies.push(z);
  say(ws, `Dark energy tears through the fallen ${corpse.name} — it rises to serve you!`, 'skill');
  say(ws, `  Zombie ${corpse.name} [HP:${z.hp}/${z.maxhp} ATK:${z.atk}] — ${p.zombies.length}/${maxZ} zombie slots used.`, 'skill');
  sayRoom(p.room, `${p.name} raises ${corpse.name} from the dead!`, 'narrate', ws);
  if(p.zombies.length>=3) checkAch(ws,p,'necro');
  sidebar(ws,p);
}

// ── Achievements ──────────────────────────────────────────────────────────
const ACHS = [
  {id:'first_blood',   name:'First Blood',    desc:'Win your first combat.',        reward:50},
  {id:'level5',        name:'Seasoned',        desc:'Reach Level 5.',                reward:100},
  {id:'level10',       name:'Veteran',         desc:'Reach Level 10.',               reward:250},
  {id:'level20',       name:'Legend',          desc:'Reach Level 20.',               reward:500},
  {id:'slayer10',      name:'Monster Slayer',  desc:'Kill 10 monsters.',             reward:75},
  {id:'slayer100',     name:'Monster Hunter',  desc:'Kill 100 monsters.',            reward:200},
  {id:'lich_slayer',   name:'Lich Slayer',     desc:'Defeat the Dungeon Lich.',      reward:300},
  {id:'all_bosses',    name:'Boss Hunter',     desc:'Slay all 4 main zone bosses.',  reward:600},
  {id:'crafter',       name:'Crafter',         desc:'Craft your first item.',        reward:50},
  {id:'tamer',         name:'Beast Tamer',     desc:'Tame a wild animal.',           reward:75},
  {id:'necro',         name:'Necromancer',     desc:'Command 3 zombies at once.',    reward:100},
  {id:'rich',          name:'Gold Hoarder',    desc:'Accumulate 1000 gold.',         reward:0},
  {id:'guild_founder', name:'Guild Founder',   desc:'Found a guild.',                reward:100},
  {id:'party_up',      name:'Better Together', desc:'Join or form a party.',         reward:50},
  {id:'explorer',      name:'Explorer',        desc:'Visit all 4 original zones.',   reward:200},
  {id:'deep_explorer', name:'Deep Explorer',   desc:'Visit all 8 adventure zones.',  reward:500}
];
function checkAch(ws, p, id) {
  if (!p.achievements) p.achievements = [];
  if (p.achievements.includes(id)) return;
  const def = ACHS.find(a => a.id===id); if (!def) return;
  p.achievements.push(id);
  if (def.reward > 0) p.gold += def.reward;
  say(ws, `🏆 ACHIEVEMENT: ${def.name} — ${def.desc}${def.reward>0?` (+${def.reward}g)`:''}`, 'loot');
  bAll({type:'line', text:`🏆 ${p.name} unlocked: ${def.name}!`, cls:'loot'});
}

// ── Level up ──────────────────────────────────────────────────────────────
function xpToLevel(lvl){ return Math.floor(300*Math.pow(lvl,1.5)); }
function levelUp(ws, p) {
  while (p.xp >= xpToLevel(p.level)) {
    p.level++; p.maxhp+=12; p.hp=p.maxhp; p.atk+=2; p.def+=1;
    const agiUp = p.level%2===0;
    if(agiUp){p.agi+=1;say(ws,`★ LEVEL UP! Level ${p.level}! HP restored. ATK +2, DEF +1, AGI +1. ★`,'ok');}
    else{say(ws,`★ LEVEL UP! Level ${p.level}! HP restored. ATK +2, DEF +1. ★`,'ok');}
    // Send visual level-up event to client
    raw(ws,{type:'level_up', level:p.level, maxhp:p.maxhp, atk:p.atk, def:p.def, agi:p.agi||0, agiUp});
    if(p.level>=5)checkAch(ws,p,'level5');
    if(p.level>=10)checkAch(ws,p,'level10');
    if(p.level>=20)checkAch(ws,p,'level20');
    if(p.level%10===0)setTimeout(()=>offerSpecialization(ws,p),500);
  }
}

// ── Cooldown tick ─────────────────────────────────────────────────────────
function tickCD(p) {
  if (p.cd) for (const k in p.cd) if (p.cd[k]>0) p.cd[k]--;
  const dec = k => { if (p[k]>0) p[k]--; };
  ['bcT','pbT','frozenT','rageT','shiftT','lichT','consecT','regrowthT',
   'totemT','plagueT','curseT','darkpactT','doomT','darkAuraT','deathmarkT',
   'elementalT','catalystT','inspireT'].forEach(dec);
  if (p.shiftT===0&&p._shiftActive) { p.atk-=3;p.def-=3;p._shiftActive=false; }
  if (p.lichT===0&&p._lichActive)   { p.atk-=4;p.def-=2;p._lichActive=false; }
  if (p.darkpactT===0&&p._darkPactActive) { p.atk-=5;p._darkPactActive=false; }
  if (p.catalystT===0&&p._catalystActive){ p.atk-=3;p._catalystActive=false; }
  if (p.inspireT===0&&p._inspireActive)  { p.atk-=2;p._inspireActive=false; }
  if (p.elementalT===0&&p._elementalActive){ p.atk-=5;p._elementalActive=false; }
  if (p.rageT===0) p.rageA=0;
}

// ── Combat ────────────────────────────────────────────────────────────────
function getWeatherXPBonus(){ return (weather==='clear'&&!isNight)?1.1:1.0; }
function getWeatherCombatMod(roomId){
  // Storm makes outdoor monsters harder
  if(weather==='storm'&&OUTDOOR_ROOMS.includes(roomId))return 1.3;
  // Night makes all outdoor monsters stronger
  if(isNight&&OUTDOOR_ROOMS.includes(roomId))return 1.2;
  return 1.0;
}
// ── Monster Special Attacks ──────────────────────────────────────────────
// Maps monster name keywords → special attack type
// Specials: poison, stun, drain, frenzy, fear
const MONSTER_SPECIALS = {
  // Poison: DoT 3 dmg/turn for 3 turns
  'spider':   'poison', 'venom':    'poison', 'serpent':  'poison',
  'basilisk': 'poison', 'bog':      'poison', 'slime':    'poison',
  'plague':   'poison', 'scorpion': 'poison', 'cobra':    'poison',
  // Drain: monster heals 30% of damage dealt
  'vampire':  'drain',  'wraith':   'drain',  'lich':     'drain',
  'leech':    'drain',  'shade':    'drain',  'specter':  'drain',
  'revenant': 'drain',  'wight':    'drain',  'banshee':  'drain',
  // Stun: player skips their next attack turn
  'golem':    'stun',   'troll':    'stun',   'giant':    'stun',
  'ogre':     'stun',   'brute':    'stun',   'hammer':   'stun',
  'boulder':  'stun',   'crusher':  'stun',
  // Frenzy: extra quick attack this turn (no additional DoT/shield check)
  'berserker':'frenzy', 'demon':    'frenzy', 'fury':     'frenzy',
  'frenzied': 'frenzy', 'enraged':  'frenzy', 'rabid':    'frenzy',
  // Fear: player has 40% miss chance next attack
  'boss':     'fear',   'dragon':   'fear',   'lich':     'fear',
  'shadow':   'fear',   'horror':   'fear',   'terror':   'fear',
};

function getMonsterSpecial(m) {
  if(m.special)return m.special; // explicit override on monster object
  const nameLow=(m.name||'').toLowerCase();
  for(const[key,spec]of Object.entries(MONSTER_SPECIALS)){
    if(nameLow.includes(key))return spec;
  }
  return null;
}

function startCombat(ws, p, target) {
  const hostiles = (world[p.room].monsters||[]).filter(m=>!m.dead);
  if (!hostiles.length) return say(ws,'Nothing to attack here.','err');
  const m = (target&&hostiles.find(x=>x.name.toLowerCase().includes(target)))||hostiles[0];
  p.inCombat=true; p.enemy=m;
  const combatMod=getWeatherCombatMod(p.room);
  if(combatMod>1.0){
    const modLabel=weather==='storm'?'Storm-empowered':'Night-shrouded';
    say(ws,`  ⚡ ${modLabel} — this creature fights harder in these conditions!`,'err');
  }
  say(ws, `You engage ${m.name}! [HP:${m.hp}/${m.maxhp}]`, 'combat');
  say(ws, 'ATTACK / FLEE / SKILL [name] / USE [item]', 'sys');
  sayRoom(p.room, `${p.name} engages ${m.name}!`, 'combat', ws);
  // Send monster portrait if available
  const portrait=MOB_PORTRAITS[m.name];
  if(portrait)raw(ws,{type:'mob_portrait',name:m.name,img:resolveImg('monsters',portrait),hp:m.hp,maxhp:m.maxhp,atk:m.atk,def:m.def});
  // Notify party members in the same room so their combat overlay pops open
  const _cp=getParty(p.username);
  if(_cp){const _party=parties.get(_cp.id);if(_party){_party.members.forEach(u=>{if(u===p.username)return;const mate=[...sessions.values()].find(x=>x.username===u&&x.loggedIn&&x.room===p.room);if(mate)raw(mate.ws,{type:'group_combat',attacker:p.name,name:m.name,img:portrait?resolveImg('monsters',portrait):null,hp:m.hp,maxhp:m.maxhp,atk:m.atk,def:m.def});});}}
}

function pvpResult(ws, winner, loser) {
  const xpGain = Math.max(10, loser.level * 20);
  const goldGain = Math.max(0, Math.floor(loser.gold * 0.1));
  winner.xp += xpGain; winner.gold += goldGain;
  loser.gold = Math.max(0, loser.gold - goldGain);
  sayRoom(winner.room, `⚔ ${winner.name} defeats ${loser.name} in single combat!`, 'combat');
  say(winner.ws, `Victory! You defeat ${loser.name}! +${xpGain} XP, +${goldGain} gold seized!`, 'ok');
  say(loser.ws, `Defeated by ${loser.name}. You lose ${goldGain} gold and retreat to Town Square.`, 'err');
  loser.hp = 1; loser.inCombat = false; loser.enemy = null;
  loser.room = 'town_square';
  describeRoom(loser.ws, loser); svc(loser); sidebar(loser.ws, loser);
  levelUp(winner.ws, winner); svc(winner); sidebar(winner.ws, winner);
}

function pvpFight(challenger, defender) {
  const cInit = rnd(1,6) + (challenger.agi||5);
  const dInit = rnd(1,6) + (defender.agi||5);
  const first  = cInit >= dInit ? challenger : defender;
  const second = first === challenger ? defender : challenger;
  say(first.ws,  `⚔ DUEL! You act first! [Speed: ${cInit} vs ${dInit}]`, 'combat');
  say(second.ws, `⚔ DUEL! ${first.name} acts first! [Speed: ${cInit} vs ${dInit}]`, 'combat');
  let p1hp = challenger.hp, p2hp = defender.hp;
  const MAX_ROUNDS = 10;
  for(let round = 1; round <= MAX_ROUNDS && p1hp > 0 && p2hp > 0; round++) {
    const atk = round % 2 === 1 ? first : second;
    const def = atk === challenger ? defender : challenger;
    const atkMod = Math.floor(atk.atk / 3);
    const defAC  = 7 + def.def;
    const d20 = rnd(1, 20);
    const isCrit = d20 >= 18;
    const isHit  = d20 > 1 && (d20 + atkMod) >= defAC;
    if(isHit) {
      const base = Math.max(1, atk.atk);
      let dmg = isCrit ? rnd(Math.floor(base*1.0), Math.floor(base*1.6)) : rnd(Math.floor(base*0.5), Math.floor(base*0.9));
      dmg = Math.max(1, dmg);
      if(atk === challenger) p2hp -= dmg; else p1hp -= dmg;
      const targetHp = atk === challenger ? Math.max(0,p2hp) : Math.max(0,p1hp);
      say(atk.ws, `Round ${round}: You hit ${def.name} for ${dmg}${isCrit?' ★CRIT★':''}! [${def.name} HP: ${targetHp}]`, 'combat');
      say(def.ws, `Round ${round}: ${atk.name} hits you for ${dmg}${isCrit?' ★CRIT★':''}! [Your HP: ${targetHp}]`, 'combat');
    } else {
      say(atk.ws, `Round ${round}: Your attack misses ${def.name}! [Roll: ${d20}+${atkMod} vs AC ${defAC}]`, 'combat');
      say(def.ws, `Round ${round}: ${atk.name} misses you!`, 'combat');
    }
    if(p1hp <= 0 || p2hp <= 0) break;
  }
  const cPct = p1hp / Math.max(1, challenger.maxhp);
  const dPct = p2hp / Math.max(1, defender.maxhp);
  const winner = p1hp <= 0 ? defender : (p2hp <= 0 ? challenger : (cPct >= dPct ? challenger : defender));
  const loser  = winner === challenger ? defender : challenger;
  pvpResult(winner.ws, winner, loser);
}

function playerAttack(ws, p) {
  // ── Advance to next joined enemy if primary is dead ───────────────────────
  if(!p.enemy || p.enemy.dead || p.enemy.hp<=0) {
    const _je=(p.enemiesJoined||[]).filter(e=>!e.dead&&e.hp>0);
    if(_je.length){p.enemy=_je[0];p.enemiesJoined=_je.slice(1);say(ws,`⚔ ${p.enemy.name} steps forward!`,'combat');}
    else{p.inCombat=false;p.enemy=null;p.enemiesJoined=[];return;}
  }
  const m=p.enemy;
  if(!p.enemiesJoined)p.enemiesJoined=[];

  // ── Check for room monsters joining (45% each per round) ─────────────────
  const _engagedNames=new Set([m.name,...p.enemiesJoined.map(e=>e.name)]);
  for(const _rm of (world[p.room]?.monsters||[])){
    if(!_rm.dead&&_rm.hp>0&&!_engagedNames.has(_rm.name)&&rnd(1,100)<=45){
      p.enemiesJoined.push({..._rm,hp:_rm.maxhp,dead:false});
      _engagedNames.add(_rm.name);
      say(ws,`⚡ ${_rm.name} is drawn into the fight!`,'combat');
    }
  }

  // ── Build combatant list with initiative ──────────────────────────────────
  const _comps=[
    ...(p.companions&&p.companions.length?p.companions:(p.companion?[p.companion]:[])),
    ...(p.adventurers||[]).filter(a=>!a.resting)
  ].filter(c=>c&&c.hp>0);
  const _zombies=(p.zombies||[]).filter(z=>z&&z.hp>0);
  const _liveEnemies=()=>[p.enemy,...(p.enemiesJoined||[])].filter(e=>e&&!e.dead&&e.hp>0);

  const _actors=[
    {type:'player',init:rnd(1,6)+(p.agi||5)},
    ..._comps.map(c=>({type:'companion',c,init:rnd(1,6)+3})),
    ..._zombies.map(z=>({type:'zombie',z,init:rnd(1,4)+1})),
    ..._liveEnemies().map(mon=>({type:'monster',mon,init:rnd(1,6)+Math.floor(((mon.atk||0)+(mon.def||0))/3)}))
  ].sort((a,b)=>b.init-a.init);

  // Show initiative order when grouped
  const _isGroup=_comps.length||_zombies.length||_liveEnemies().length>1;
  if(_isGroup){
    const _ns=_actors.map(a=>a.type==='player'?p.name:a.type==='companion'?a.c.name:a.type==='zombie'?'🧟Zombie':a.mon.name);
    say(ws,`⚡ Initiative: ${_ns.join(' → ')}`,'combat');
  } else {
    const _pI=_actors[0]?.init||0;
    const _mI=_actors.find(a=>a.type==='monster')?.init||0;
    if(_mI>_pI) say(ws,`⚡ ${m.name} acts first! [Speed: ${_pI} vs ${_mI}]`,'combat');
  }

  // ── Execute turns in initiative order ─────────────────────────────────────
  let _done=false,_dotsApplied=false,_ztDmg=0,_ztName='';

  for(const actor of _actors){
    if(_done||!p.inCombat||p.hp<=0)break;

    // ── Player turn ────────────────────────────────────────────────────────
    if(actor.type==='player'){
      const _tm=p.enemy;
      if(!_tm||_tm.dead||_tm.hp<=0){_done=true;break;}
      // ── Monster status: Stun (skip this attack) ─────────────────────────
      if((p.mStunned||0)>0){
        p.mStunned--;
        say(ws,`💫 You are stunned and cannot attack this round!`,'err');
        continue;
      }
      const pb=(p.pbT||0)>0?p.pbD:0,rage=(p.rageT||0)>0?p.rageA:0;
      const dm=(p.deathmarkT||0)>0?1.5:1,doom=(p.doomT||0)>0?2:1;
      p.atkBonus=0;
      const atkMod=Math.floor(p.atk/3),monAC=7+_tm.def;
      const d20=rnd(1,20),rollTotal=d20+atkMod;
      const isFumble=d20===1,isCrit=!isFumble&&d20>=18;
      // Fear: 40% chance to miss even if roll succeeds
      let isHit=!isFumble&&rollTotal>=monAC;
      if(isHit&&(p.mFeared||0)>0){
        p.mFeared--;
        if(rnd(1,100)<=40){isHit=false;say(ws,`😱 Fear grips you — your attack falters!`,'err');}
        else if(p.mFeared===0)say(ws,'You shake off the fear!','ok');
      }
      if(isFumble){
        say(ws,`You fumble! Your weapon slips — ${_tm.name} takes no damage. [Roll: 1]`,'combat');
      } else if(!isHit){
        say(ws,`Your attack misses ${_tm.name}! [Roll: ${d20}+${atkMod}=${rollTotal} vs AC ${monAC}]`,'combat');
      } else {
        const atkVal=Math.max(1,p.atk+pb+rage);
        const baseMin=Math.max(1,Math.floor(atkVal*0.6)),baseMax=Math.max(baseMin+2,Math.floor(atkVal*1.2));
        let dmg=isCrit?rnd(baseMax,Math.floor(baseMax*1.8)):rnd(baseMin,baseMax);
        if(isCrit)say(ws,`⚔ CRITICAL STRIKE!`,'skill');
        dmg=Math.max(1,Math.floor(dmg*dm*doom));
        _tm.hp-=dmg;
        const critTag=isCrit?' ★CRIT★':'',poisTag=pb>0?` (+${pb} poison)`:'';
        say(ws,`You strike ${_tm.name} for ${dmg} damage!${critTag}${poisTag} [Roll: ${d20}+${atkMod}] [${Math.max(0,_tm.hp)}/${_tm.maxhp} HP]`,'combat');
        const _port=MOB_PORTRAITS[_tm.name];if(_port){raw(ws,{type:'mob_hp',hp:Math.max(0,_tm.hp),maxhp:_tm.maxhp});const _hpp=getParty(p.username);if(_hpp){const _hpParty=parties.get(_hpp.id);if(_hpParty)_hpParty.members.forEach(u=>{if(u===p.username)return;const _hpM=[...sessions.values()].find(x=>x.username===u&&x.loggedIn&&x.room===p.room);if(_hpM)raw(_hpM.ws,{type:'mob_hp',hp:Math.max(0,_tm.hp),maxhp:_tm.maxhp});});}}
        sayRoom(p.room,`${p.name} hits ${_tm.name} for ${dmg}!${critTag}`,'combat',ws);
      }
      if(_tm.hp<=0&&!_tm.dead){
        killMonster(ws,p,_tm);
        const _ne=(p.enemiesJoined||[]).filter(e=>!e.dead&&e.hp>0);
        if(_ne.length){p.enemy=_ne[0];p.enemiesJoined=_ne.slice(1);p.inCombat=true;say(ws,`⚔ ${p.enemy.name} closes in!`,'combat');}
        else _done=true;
      }
    }

    // ── Companion turn ─────────────────────────────────────────────────────
    else if(actor.type==='companion'){
      if(actor.c.hp<=0)continue;
      const _tgt=_liveEnemies()[0];if(!_tgt){_done=true;break;}
      const _cd=rnd(Math.floor(actor.c.atk*0.6),actor.c.atk);
      _tgt.hp-=_cd;
      say(ws,`${actor.c.name} strikes ${_tgt.name} for ${_cd}! [${Math.max(0,_tgt.hp)}/${_tgt.maxhp} HP]`,'narrate');
      if(_tgt.hp<=0&&!_tgt.dead){
        _tgt.dead=true;
        say(ws,`${actor.c.name} finishes off ${_tgt.name}!`,'ok');
        if(_tgt===p.enemy){
          p.xp+=(_tgt.xp||0);p.gold+=(_tgt.gold||0);
          if(_tgt.xp||_tgt.gold)say(ws,`+${_tgt.xp||0} XP, +${_tgt.gold||0} gold.`,'loot');
          levelUp(ws,p);
          const _ne=(p.enemiesJoined||[]).filter(e=>!e.dead&&e.hp>0);
          if(_ne.length){p.enemy=_ne[0];p.enemiesJoined=_ne.slice(1);p.inCombat=true;say(ws,`⚔ ${p.enemy.name} closes in!`,'combat');}
          else{p.inCombat=false;p.enemy=null;p.enemiesJoined=[];p.backstabUsed=false;tickCD(p);svc(p);sidebar(ws,p);_done=true;}
        }
      }
    }

    // ── Zombie turn (monsters do NOT target zombies) ────────────────────────
    else if(actor.type==='zombie'){
      const _tgt=_liveEnemies()[0];if(!_tgt){_done=true;break;}
      const _zd=rnd(Math.floor(actor.z.atk*0.5),actor.z.atk);
      _tgt.hp-=_zd;_ztDmg+=_zd;_ztName=_tgt.name;
    }

    // ── Monster turn ───────────────────────────────────────────────────────
    else if(actor.type==='monster'){
      if(!p.inCombat||actor.mon.dead||actor.mon.hp<=0)continue;

      // Apply DoTs/regens once this round (on first monster to act)
      if(!_dotsApplied){
        _dotsApplied=true;
        const _dotM=actor.mon;
        if((p.plagueT||0)>0){_dotM.hp-=(p.plagueD||0);say(ws,`Plague: ${p.plagueD} to ${_dotM.name}.`,'skill');if(_dotM.hp<=0){tickCD(p);killMonster(ws,p,_dotM);const _ne=(p.enemiesJoined||[]).filter(e=>!e.dead&&e.hp>0);if(_ne.length){p.enemy=_ne[0];p.enemiesJoined=_ne.slice(1);p.inCombat=true;say(ws,`⚔ ${p.enemy.name} closes in!`,'combat');}else _done=true;continue;}}
        if((p.curseT||0)>0){_dotM.hp-=(p.curseD||0);say(ws,`Curse: ${p.curseD} to ${_dotM.name}.`,'skill');if(_dotM.hp<=0){tickCD(p);killMonster(ws,p,_dotM);const _ne=(p.enemiesJoined||[]).filter(e=>!e.dead&&e.hp>0);if(_ne.length){p.enemy=_ne[0];p.enemiesJoined=_ne.slice(1);p.inCombat=true;say(ws,`⚔ ${p.enemy.name} closes in!`,'combat');}else _done=true;continue;}}
        if((p.consecT||0)>0){_dotM.hp-=4;say(ws,'Consecrate: 4 to enemy.','skill');if(_dotM.hp<=0){tickCD(p);killMonster(ws,p,_dotM);const _ne=(p.enemiesJoined||[]).filter(e=>!e.dead&&e.hp>0);if(_ne.length){p.enemy=_ne[0];p.enemiesJoined=_ne.slice(1);p.inCombat=true;say(ws,`⚔ ${p.enemy.name} closes in!`,'combat');}else _done=true;continue;}}
        if((p.regrowthT||0)>0){const _h=Math.min(5,p.maxhp-p.hp);p.hp+=_h;say(ws,`Regrowth: +${_h} HP.`,'skill');}
        if((p.totemT||0)>0){const _h=Math.min(p.totemH||5,p.maxhp-p.hp);p.hp+=_h;say(ws,`Totem: +${_h} HP.`,'skill');}
        if(actor.mon.dead||actor.mon.hp<=0)continue;
      }

      // Pick target: player or companion (NOT zombies)
      const _aComps=_comps.filter(c=>c.hp>0);
      const _pool=[{t:'player'},..._aComps.map(c=>({t:'comp',c}))];
      const _pick=_pool[rnd(0,_pool.length-1)];

      if(_pick.t==='player'){
        monsterAttack(ws,p,actor.mon,true,true); // skipDoTs+skipTick — handled above/below
        if(p.hp<=0||!p.inCombat){_done=true;break;}
      } else {
        const _comp=_pick.c;
        if(!_comp||_comp.hp<=0)continue;
        const _mAtkMod=Math.floor(actor.mon.atk/3),_compAC=7;
        const _d20c=rnd(1,20),_mRoll=_d20c+_mAtkMod;
        if(_d20c===1||_mRoll<_compAC){
          say(ws,`${actor.mon.name} lunges at ${_comp.name} but misses!`,'combat');
        } else {
          const _mCrit=_d20c>=19,_mVal=Math.max(1,actor.mon.atk);
          const _mMin=Math.max(1,Math.floor(_mVal*0.6)),_mMax=Math.max(_mMin+2,Math.floor(_mVal*1.1));
          let _mdmg=_mCrit?rnd(_mMax,Math.floor(_mMax*1.6)):rnd(_mMin,_mMax);
          _comp.hp=Math.max(0,_comp.hp-_mdmg);
          say(ws,`${actor.mon.name} attacks ${_comp.name} for ${_mdmg}${_mCrit?' ★CRIT★':''}! [${_comp.name}: ${_comp.hp}/${_comp.maxhp} HP]`,'combat');
          if(_comp.hp<=0){
            say(ws,`💀 ${_comp.name} has fallen in battle!`,'err');
            // Adventurers go "resting" (need inn to revive); companions are removed
            const _isAdv=(p.adventurers||[]).find(a=>a===_comp);
            if(_isAdv){_isAdv.resting=true;_isAdv.hp=0;say(ws,`${_comp.name} is resting — visit an inn to revive them.`,'sys');}
            else{p.companions=(p.companions||[]).filter(c=>c!==_comp);if(p.companion===_comp)p.companion=p.companions[0]||null;}
            sidebar(ws,p);
          }
        }
      }
    }
  }

  // ── Zombie damage summary ─────────────────────────────────────────────────
  if(_ztDmg>0)say(ws,`Your ${_zombies.length} zombie(s) deal ${_ztDmg} damage to ${_ztName}!`,'narrate');

  // ── Corpse decay ──────────────────────────────────────────────────────────
  if(world[p.room]?.corpses?.length&&!_done){
    world[p.room].corpses=world[p.room].corpses.filter(c=>{
      if(c.raised)return true;
      c.rounds=(c.rounds??3)-1;
      if(c.rounds<=0){clearTimeout(c._timer);say(ws,`The remains of ${c.name} crumble to dust.`,'narrate');return false;}
      if(c.rounds===1)say(ws,`The corpse of ${c.name} is nearly dust — 1 round left!`,'narrate');
      return true;
    });
  }

  // ── End-of-round tick ─────────────────────────────────────────────────────
  if(p.inCombat&&!_done){tickCD(p);sidebar(ws,p);}
  svc(p);
}

// ── Companion helpers ─────────────────────────────────────────────────────
function advLevelXp(level){return level*80+40;} // XP needed to level up from this level

// ── Reputation System ─────────────────────────────────────────────────────
const REP_FACTIONS={
  temple:{name:'Temple of the Fallen',   short:'Temple',  color:'#c0a060'},
  guild: {name:'Adventurers\' Guild',    short:'Guild',   color:'#60a0c0'},
  miners:{name:'Ironveil Mining Co.',    short:'Miners',  color:'#a0a0a0'},
  order: {name:'Order of the Blade',    short:'Order',   color:'#e0c060'},
  shadow:{name:'The Shadow Compact',    short:'Shadow',  color:'#8060c0'},
};
const REP_THRESHOLDS=[
  {val:-1000,label:'Hated',   cls:'err'},
  {val:-500, label:'Hostile', cls:'err'},
  {val:0,    label:'Neutral', cls:'sys'},
  {val:100,  label:'Friendly',cls:'ok'},
  {val:500,  label:'Honored', cls:'ok'},
  {val:1000, label:'Exalted', cls:'loot'},
];
function repLabel(val){return REP_THRESHOLDS.slice().reverse().find(t=>val>=t.val)||REP_THRESHOLDS[0];}
const _REP_MONSTER_MAP={
  // Temple rep: kill undead and cultists
  'skeleton':1,'zombie':2,'dungeon lich':50,'void cultist':5,'void acolyte':5,
  'shade':2,'wraith':3,'bone knight':4,'revenant':3,'soul drinker':4,'mine wraith':3,
  // Guild rep: kill dungeon monsters
  'goblin':1,'orc':1,'troll':2,'dark knight':3,'fire elemental':3,'ice golem':3,
  'dungeon imp':1,'cave spider':1,'giant rat':1,'road bandit':2,'cutpurse':1,
  // Miners rep: mine area monsters
  'cave spider':1,'rock snake':1,'stone gnome':2,'iron golem shard':3,
  // Order rep: kill elite/boss monsters
  'flame titan':30,'frost queen':30,'storm god':30,'void emperor':50,'prism titan':30,'death baron':30,'astral leviathan':30,'void god':50,
  // Shadow rep: kill law/order enemies (none by default — earned through quests)
};
const _REP_FACTION_FOR={};
Object.entries(_REP_MONSTER_MAP).forEach(([mon,pts])=>{
  const mn=mon.toLowerCase();
  if(['skeleton','zombie','dungeon lich','void cultist','void acolyte','shade','wraith','bone knight','revenant','soul drinker','mine wraith'].includes(mn)) (_REP_FACTION_FOR[mn]||={}). temple=pts;
  if(['goblin','orc','troll','dark knight','fire elemental','ice golem','dungeon imp','cave spider','giant rat','road bandit','cutpurse'].includes(mn)) (_REP_FACTION_FOR[mn]||={}).guild=pts;
  if(['cave spider','rock snake','stone gnome','iron golem shard'].includes(mn)) (_REP_FACTION_FOR[mn]||={}).miners=pts;
  if(['flame titan','frost queen','storm god','void emperor','prism titan','death baron','astral leviathan','void god','dungeon lich'].includes(mn)) (_REP_FACTION_FOR[mn]||={}).order=pts;
});
function ensureRep(p){if(!p.reputation)p.reputation={temple:0,guild:0,miners:0,order:0,shadow:0};}
function awardRep(ws,p,m){
  ensureRep(p);
  const mn=(m.name||'').toLowerCase();
  const gains=_REP_FACTION_FOR[mn];
  if(!gains)return;
  let msgs=[];
  Object.entries(gains).forEach(([fac,pts])=>{
    const before=repLabel(p.reputation[fac]||0).label;
    p.reputation[fac]=(p.reputation[fac]||0)+pts;
    const after=repLabel(p.reputation[fac]).label;
    if(after!==before)msgs.push(`${REP_FACTIONS[fac].short} rep: ${before} → ${after}!`);
  });
  if(msgs.length)say(ws,'⚑ '+msgs.join('  '),'loot');
}

function killMonster(ws, p, m) {
  m.dead=true;
  say(ws, `You slay ${m.name}!`, 'ok');
  sayRoom(p.room, `${p.name} slays ${m.name}!`, 'ok', ws);
  const bonus=(p.classId==='rogue'?rnd(1,12):0)+(p.raceId==='goblin'?rnd(1,8):0);
  const xpBonus=Math.floor(m.xp*getWeatherXPBonus());p.xp+=xpBonus; p.gold+=m.gold+bonus; p.killCount=(p.killCount||0)+1;
  say(ws, `+${m.xp} XP, +${m.gold+bonus} gold. [${p.killCount} kills]`, 'loot');
  // Leave a corpse that can be raised — decays after 3 combat rounds (or 3 min fallback)
  if(!world[p.room].corpses) world[p.room].corpses=[];
  const _corpse={name:m.name,maxhp:m.maxhp,atk:m.atk,xp:m.xp,raised:false,rounds:3};
  world[p.room].corpses.push(_corpse);
  say(ws,`The corpse of ${m.name} lies here. Necromancers have 3 rounds to raise it.`,'narrate');
  // Time-based fallback (3 minutes) in case no further combat rounds occur
  _corpse._timer=setTimeout(()=>{
    if(world[p.room]&&world[p.room].corpses){
      const idx=world[p.room].corpses.indexOf(_corpse);
      if(idx!==-1&&!_corpse.raised){
        world[p.room].corpses.splice(idx,1);
        sayRoom(p.room,`The remains of ${_corpse.name} crumble to dust.`,'narrate');
      }
    }
  },180000);
  if (m.loot) {
    if(p.autoloot){
      p.inventory.push(m.loot);
      say(ws,`[Auto-loot] ${m.loot} picked up.`,'loot');
      const eq=EQ[m.loot.toLowerCase()];
      if(eq)say(ws,`  [${eq.t.toUpperCase()}] ATK+${eq.atk} DEF+${eq.def} — EQUIP to use.`,'sys');
    }else{
      world[p.room].items.push(m.loot);
      say(ws,`Dropped: ${m.loot}`,'loot');
      const eqDrop=EQ[m.loot.toLowerCase()];
      if(eqDrop)say(ws,`  [${eqDrop.t.toUpperCase()}] ATK+${eqDrop.atk} DEF+${eqDrop.def} — TAKE it then EQUIP ${m.loot}`,'loot');
    }
  }
  // Party XP share
  const party = getParty(p.username);
  if (party && party.members.size>1) {
    const shareXP = Math.floor(m.xp*0.7);
    party.members.forEach(u => {
      if (u===p.username) return;
      const mate = [...sessions.values()].find(x=>x.username===u&&x.loggedIn);
      if (mate) { mate.xp+=shareXP; say(mate.ws,`Party XP: +${shareXP} from ${p.name}'s kill.`,'ok'); levelUp(mate.ws,mate); }
    });
  }
  // ── Companion XP ──────────────────────────────────────────────────────────
  if(p.adventurers&&p.adventurers.length){
    const advXp=Math.max(1,Math.floor(m.xp*0.3));
    p.adventurers.forEach(a=>{
      if(a.resting)return;
      a.xp=(a.xp||0)+advXp;
      const advDef=ADVENTURERS[a.key];
      const xpNeeded=advLevelXp(a.level||1);
      if(a.xp>=xpNeeded){
        a.xp-=xpNeeded; a.level=(a.level||1)+1;
        a.atk=Math.floor((advDef?.baseAtk||8)+(a.level-1)*1.5);
        a.maxhp=Math.floor((advDef?.baseHp||35)+(a.level-1)*8);
        a.hp=a.maxhp;
        say(ws,`✨ ${a.name} reached Level ${a.level}! ATK ${a.atk} HP ${a.maxhp}`,'loot');
        sidebar(ws,p);
      }
    });
  }
  // ── Reputation ────────────────────────────────────────────────────────────
  awardRep(ws,p,m);
  p.inCombat=false; p.enemy=null; p.backstabUsed=false;
  tickCD(p); levelUp(ws,p);
  sendRoomOccupants(p.room);
  checkAch(ws,p,'first_blood');
  if(p.killCount>=10)checkAch(ws,p,'slayer10');
  if(p.killCount>=100)checkAch(ws,p,'slayer100');
  if(p.gold>=1000)checkAch(ws,p,'rich');
  const BOSSES=['Dungeon Lich','Flame Titan','Frost Queen','Storm God','Void Emperor','Prism Titan','Death Baron','Astral Leviathan','Void God'];
  if (BOSSES.includes(m.name)) {
    bAll({type:'line',text:`*** ${p.name} the ${p.raceName} ${p.className} has slain ${m.name}! ***`,cls:'loot'});
    if (m.name==='Dungeon Lich') { checkAch(ws,p,'lich_slayer'); doVictory(ws,p); }
  }
  svc(p); sidebar(ws,p); sendRoomVisual(ws,p);
}

function monsterAttack(ws, p, m, skipDoTs=false, skipTick=false) {
  if (p.isAdmin) return; // admins are immune — mobs do not attack
  if ((p.frozenT||0)>0) { say(ws,`${m.name} is frozen and cannot act!`,'skill'); tickCD(p); sidebar(ws,p); return; }

  // ── DoTs & regen tick (always happen regardless of hit/miss) ────────────
  if(!skipDoTs){
    if((p.plagueT||0)>0)  { m.hp-=(p.plagueD||0); say(ws,`Plague: ${p.plagueD} to ${m.name}.`,'skill'); if(m.hp<=0){tickCD(p);return killMonster(ws,p,m);} }
    if((p.curseT||0)>0)   { m.hp-=(p.curseD||0);  say(ws,`Curse: ${p.curseD} to ${m.name}.`,'skill');  if(m.hp<=0){tickCD(p);return killMonster(ws,p,m);} }
    if((p.consecT||0)>0)  { m.hp-=4;              say(ws,'Consecrate: 4 to enemy.','skill'); if(m.hp<=0){tickCD(p);return killMonster(ws,p,m);} }
    if((p.regrowthT||0)>0){ const h=Math.min(5,p.maxhp-p.hp);p.hp+=h; say(ws,`Regrowth: +${h} HP.`,'skill'); }
    if((p.totemT||0)>0)   { const h=Math.min(p.totemH||5,p.maxhp-p.hp);p.hp+=h; say(ws,`Totem: +${h} HP.`,'skill'); }
  }

  // ── d20 Monster Attack Roll ──────────────────────────────────────────────
  const mAtkMod  = Math.floor(m.atk / 3);
  const playerAC = 7 + p.def;
  const d20      = rnd(1, 20);
  const mRollTot = d20 + mAtkMod;
  const mFumble  = d20 === 1;
  const mCrit    = !mFumble && d20 >= 19;          // crit on 19-20 (10% chance)
  const mHit     = !mFumble && mRollTot >= playerAC;

  if (mFumble || !mHit) {
    say(ws, mFumble
      ? `${m.name} stumbles — the attack goes wild!`
      : `${m.name}'s attack misses! [Roll: ${d20}+${mAtkMod}=${mRollTot} vs AC ${playerAC}]`, 'combat');
    tickCD(p); sidebar(ws,p); return;
  }

  // ── Damage Roll ──────────────────────────────────────────────────────────
  const mVal  = Math.max(1, m.atk);
  const mMin  = Math.max(1, Math.floor(mVal * 0.6));
  const mMax  = Math.max(mMin+2, Math.floor(mVal * 1.1));
  let mdmg;
  if (mCrit) {
    mdmg = rnd(mMax, Math.floor(mMax * 1.8));
    say(ws, `${m.name} lands a CRITICAL STRIKE!`, 'err');
  } else {
    mdmg = rnd(mMin, mMax);
  }

  // ── DODGE command check ──────────────────────────────────────────────────
  if(p._dodging&&mdmg>0){
    p._dodging=false;
    const dodgeChance=Math.min(75,25+Math.floor((p.agi||5)*1.5));
    if(rnd(1,100)<=dodgeChance){
      say(ws,`You dodge ${m.name}'s attack! [AGI dodge: ${dodgeChance}%]`,'skill');
      tickCD(p);sidebar(ws,p);return;
    }else{
      say(ws,`Dodge failed! [${dodgeChance}% chance] ${m.name}'s hit lands!`,'combat');
    }
  }else if(p._dodging){p._dodging=false;}

  // Beast Roar debuff reduces incoming damage
  if((p.bcT||0)>0) mdmg = Math.max(1, mdmg-(p.bcV||0));

  // ── Shields ──────────────────────────────────────────────────────────────
  const tryShield = (key, label) => {
    if (!p.sh) return;
    if (p.sh[key]===true) { say(ws,`${label} blocks completely!`,'skill'); p.sh[key]=false; mdmg=0; }
    else if (typeof p.sh[key]==='number'&&p.sh[key]>0) { const a=Math.min(p.sh[key],mdmg); p.sh[key]-=a; mdmg-=a; if(a>0)say(ws,`${label} absorbs ${a} [${p.sh[key]} left].`,'skill'); }
  };
  tryShield('divine','Divine Shield'); tryShield('arcane','Arcane Shield'); tryShield('wall','Shield Wall');
  tryShield('bone','Bone Shield'); tryShield('bark','Barkskin'); tryShield('fortress','Fortress');
  tryShield('mana','Mana Shield'); tryShield('ancestral','Ancestral Shield'); tryShield('death','Death Shield'); tryShield('wild','Wild Instinct');
  const tryDodge = (key, label) => { if(p.sh&&(p.sh[key]||0)>0){ p.sh[key]--; mdmg=0; say(ws,`${label}: dodged!`,'skill'); } };
  tryDodge('shadow','Shadowstep'); tryDodge('blink','Blink'); tryDodge('deflect','Deflect');
  tryDodge('mirror','Mirror Image'); tryDodge('counter','Counter'); tryDodge('fade','Fade');

  if (mdmg>0) { p.hp-=mdmg; p.lastKiller=m.name; say(ws,`${m.name} retaliates for ${mdmg}${mCrit?' ★CRIT★':''}. [HP:${p.hp}/${p.maxhp}]`,'combat'); }

  // ── Monster Special Attack (25% chance per hit, only when damage landed) ─
  if(mdmg>0&&!skipDoTs&&rnd(1,100)<=25){
    const spec=getMonsterSpecial(m);
    if(spec==='poison'&&!(p.mPoisonT>0)){
      p.mPoisonD=3; p.mPoisonT=3;
      say(ws,`☠ ${m.name}'s attack was venomous! You are poisoned (3 dmg × 3 turns).`,'err');
    } else if(spec==='drain'){
      const healed=Math.max(1,Math.floor(mdmg*0.3));
      m.hp=Math.min(m.maxhp,m.hp+healed);
      say(ws,`🩸 ${m.name} drains your life force! It heals ${healed} HP. [Enemy HP:${m.hp}/${m.maxhp}]`,'err');
    } else if(spec==='stun'&&!p.mStunned){
      p.mStunned=1;
      say(ws,`💫 ${m.name}'s crushing blow staggers you! You are stunned (skip next attack).`,'err');
    } else if(spec==='frenzy'){
      // Quick extra hit — simplified, half damage, no special chain
      const fDmg=Math.max(1,Math.floor(mdmg*0.5));
      p.hp-=fDmg;
      say(ws,`⚡ ${m.name} attacks again in a frenzy for ${fDmg} more! [HP:${p.hp}/${p.maxhp}]`,'err');
    } else if(spec==='fear'){
      p.mFeared=2;
      say(ws,`😱 ${m.name}'s terrifying presence shakes you! (40% miss chance for 2 turns).`,'err');
    }
  }

  // ── Monster poison tick applied to player ─────────────────────────────────
  if((p.mPoisonT||0)>0){
    p.mPoisonT--;
    p.hp-=(p.mPoisonD||3);
    say(ws,`☠ Venom burns: ${p.mPoisonD||3} damage. [HP:${p.hp}/${p.maxhp}] (${p.mPoisonT} turns left)`,'err');
    if(p.mPoisonT<=0){p.mPoisonD=0;say(ws,'The poison fades.','ok');}
  }

  if(!skipTick){ tickCD(p); sidebar(ws,p); }
  if (p.hp<=0) playerDied(ws,p);
}

const _DEATH_MSGS=[
  `The darkness takes you. When you wake, the cobblestones of the Town Square are cold under your back.`,
  `Everything goes black. A far-off voice says "Not yet." You open your eyes in the Town Square.`,
  `Your vision narrows to a point, then nothing. A shrine keeper deposits you at the Town Square steps.`,
  `The last thing you remember is falling. The first thing you see is the Town Square fountain.`,
  `Death puts its hand on your shoulder briefly, then seems to reconsider. You wake in the Town Square.`,
  `A cold wind carries you somewhere far away, then drops you — gently — in the Town Square.`,
  `The world ends. Then it doesn't. You're in the Town Square, which is a better outcome than most.`,
  `You die with some dignity. Not much, but some. You wake in the Town Square with all of it gone.`,
];
function playerDied(ws, p) {
  p.inCombat=false; p.enemy=null; p.dead=false; p.hp=1; p.zombies=[];
  p.deathCount=(p.deathCount||0)+1;
  const killerName=p.lastKiller||'something';
  const msg=_DEATH_MSGS[Math.floor(Math.random()*_DEATH_MSGS.length)];
  say(ws,''); say(ws,'╔══════════════════════════╗','err');
  say(ws,'║    Y O U   D I E D      ║','err');
  say(ws,'╚══════════════════════════╝','err');
  say(ws,`Slain by: ${killerName}  ·  Death #${p.deathCount}`,'err');
  say(ws,msg,'narrate');
  if(_pt&&_pt.seats.find(s=>s.username===p.username))_ptLeave(ws,p,'You died — your chips have been cashed out.');
  p.room='town_square'; describeRoom(ws,p); svc(p); sidebar(ws,p);
}

function doVictory(ws, p) {
  say(ws,'╔══════════════════════════════╗','loot');
  say(ws,'║     V I C T O R Y !        ║','loot');
  say(ws,'║  The Dungeon Lich crumbles! ║','loot');
  say(ws,'╚══════════════════════════════╝','loot');
}


// ── NPC definitions ───────────────────────────────────────────────────────
const NPCS = {
  tormund: {name:'Tormund',title:'Barkeep of the Broken Flagon',room:'tavern',ai:true,
    portrait:'tormund',portraitFile:'tormund.jpg',
    desc:'A barrel-chested man with a grey-streaked beard and the permanently tired eyes of someone who has heard too many hard-luck stories. He has run the Broken Flagon for twenty years and knows every face that has passed through Shadowmere — including those that never came back.',
    personality:"You are Tormund, gruff but warm barkeep at The Broken Flagon in Shadowmere. Keep responses 2-3 sentences, stay in character. You know the dungeon is south then down, the shrine is in the town square, Grimwald makes weapons, Mira sells potions, the Shadow Broker is in the alley cellar.",
    greeting:"Tormund wipes down the bar. 'What'll it be?'",
    repeatGreeting:"Tormund nods as you walk in. 'Back again. Same as last time, or you feeling adventurous?'",
    idle:["Tormund mutters: 'Haven't seen this many dead walk since the last purge...'","Tormund glances at the door. 'Every hero who went into that dungeon... most don't come back the same.'","Tormund slides a worn checkerboard across the bar. 'Care for a game while you drink?'"],
    gameChallenge:{game:'checkers',title:'Checkers',hint:"Type CHALLENGE TORMUND [gold] to play Checkers for gold."}},
  grimwald:{name:'Grimwald',title:'Master Weaponsmith',room:'weaponsmith',ai:true,
    portrait:'grimwald',portraitFile:'grimwald.jpg',
    desc:'A mountain of a man, arms like forge bellows and hands scarred from a lifetime at the anvil. Grimwald speaks rarely and means every word. The weapons on his walls have ended more monsters than any adventurer can count.',
    personality:"You are Grimwald, taciturn master weaponsmith. Speak in short blunt sentences. You care deeply about quality steel. 1-2 sentences maximum.",
    greeting:"Grimwald doesn't look up. 'Shop or talk. Not both.'",
    repeatGreeting:"Grimwald glances up briefly. 'You again. Gear holding up?' He returns to his work without waiting for an answer.",
    idle:["Grimwald holds a blade to the light and plunges it back into the forge.","Grimwald growls: 'Dull blade gets you killed.'"]},
  mira:    {name:'Mira',title:'Apothecary',room:'apothecary',ai:true,
    portrait:'mira',portraitFile:'mira.jpg',
    desc:'A silver-haired woman of indeterminate age with quick, precise hands and an unsettling habit of diagnosing ailments before you have mentioned them. She has studied at three colleges of medicine and chosen this ruined town because, as she says, it keeps her busiest.',
    personality:"You are Mira, calm knowledgeable apothecary. Speak thoughtfully and precisely. 2-3 sentences. You know about herbs, potions, and monster drops.",
    greeting:"Mira looks up from her mortar. 'What ails you, traveller?'",
    repeatGreeting:"Mira glances at you with clinical precision. 'Still standing. Good. The dungeon hasn't finished with you yet, I imagine.'",
    idle:["Mira carefully measures a powder, lips moving silently.","Mira says softly: 'The dungeon air carries a miasma. Come to me if you feel weakened.'"]},
  aldric:  {name:'Father Aldric',title:'Last Priest of the Temple',room:'temple',ai:true,
    portrait:'aldric',portraitFile:'aldric.jpg',
    desc:'The last surviving priest of the Temple of the Fallen. Once the head of a thriving order; now an old man alone in a ruin, keeping candles lit as an act of stubbornness against the dark. His faith has been shaken but never broken.',
    personality:"You are Father Aldric, last priest of the Temple of the Fallen. Old, tired, sorrowful. Formal archaic speech. 2-3 sentences.",
    greeting:"Father Aldric turns from the altar, eyes red from weeping. 'Bless you for coming, child.'",
    repeatGreeting:"Aldric sees you and a tired smile crosses his face. 'Alive still. Each time you return I think perhaps the light has not gone from this place entirely.'",
    idle:["Father Aldric whispers a prayer, hands clasped tight.","Aldric murmurs: 'The lich was once a great wizard who sought immortality. He found it — at terrible cost.'"]},
  broker:  {name:'The Shadow Broker',title:'Dealer in Rare Goods',room:'black_market',ai:true,
    portrait:'broker',portraitFile:'broker.jpg',
    desc:'No one knows the Shadow Broker real name, race, or history. They have been in that cellar, it is said, longer than the town has stood. They deal in objects that have no business existing and information that has no business being known.',
    personality:"You are the Shadow Broker, mysterious and cryptic. Speak in half-sentences, implying more than you say. 1-2 sentences, occasionally unsettling.",
    greeting:"The hooded figure doesn't move. A rasping voice: 'I wondered when you'd find me.'",
    idle:["The Shadow Broker seems to watch you, though you can't see their eyes.","A whisper: 'I know what you seek. The question is the price.'"]},
  pip:     {name:'Pip',title:'Exotic Animal Merchant',room:'pet_store',ai:true,
    portrait:'pip',portraitFile:'pip.jpg',
    desc:'A halfling of boundless energy and zero self-preservation instinct who has been bitten, stung, clawed, and sat on by every creature in the Menagerie. Pip considers this a sign of mutual affection. Every animal here has a name, a birthday, and a complete backstory.',
    personality:"You are Pip, enthusiastic halfling who runs the Exotic Menagerie. You LOVE animals with infectious enthusiasm. Very cheerful, uses exclamation points. 2-3 sentences.",
    greeting:"Pip bounces up. 'Oh! A visitor! Don't mind Chester — he bites but only out of love!'",
    idle:["Pip coos at a shadow fox: 'Yes you are the most magnificent thing...'","Pip calls out: 'The Iron Tortoise is very underrated!'"]},
  marta:   {name:'Marta',title:'General Store Owner',room:'ashford_store',ai:true,
    portrait:'marta',portraitFile:'marta.jpg',
    desc:"A weathered woman with sharp eyes and calloused hands. Marta has run the general store since before most of the village could remember. She doesn't smile easily, but she's fair — and she's survived everything the frontier has thrown at Ashford.",
    personality:"You are Marta, tough practical storekeeper in Ashford Village. Survivors settled this village after the old war. You are wary of strangers but fair. Short direct sentences. You know about the bandit problem east of town.",
    greeting:"Marta looks you up and down. 'Coin or no coin, that's the question.'",
    idle:["Marta wipes down the counter. 'Bandits east of town getting bolder every week.'","Marta grunts: 'We don't get many outsiders here. Usually they're running from something.'"]},
  barret:  {name:'Old Barret',title:'Innkeeper',room:'ashford_inn',ai:true,
    portrait:'barret',portraitFile:'barret.jpg',
    desc:"A stout, grey-bearded man who moves with the unhurried certainty of someone who has outlasted everything. Barret's Rusted Nail has stood through two wars and one dragon sighting. He pours a good measure and remembers every face that ever sat at his bar.",
    personality:"You are Old Barret, weathered innkeeper of the Rusted Nail in Ashford Village. You have seen everything in your long years. Warm but tired. You know local gossip and the history of the village.",
    greeting:"Barret looks up slowly. 'Long road to find Ashford. Most go around. What brings you here?'",
    idle:["Barret polishes a glass and stares at nothing.","Barret murmurs: 'Village used to be three times this size. Before the war.'"]},
  finn:    {name:'Brother Finn',title:'Healer',room:'ashford_healer',ai:true,
    portrait:'finn',portraitFile:'finn.jpg',
    desc:'A gentle travelling monk who stayed in Ashford to tend the sick. Young face but calm beyond his years. Simple robes, healing herbs hanging from his belt.',
    personality:"You are Brother Finn, a gentle travelling monk who stayed in Ashford to tend the sick. Calm, compassionate, slightly otherworldly. You know about healing, herbs, and the spiritual nature of the Dungeon Lich's curse.",
    greeting:"Finn looks up with kind eyes. 'Ah, a traveller. Are you hurt? Sit, sit.'",
    idle:["Finn hums softly while grinding herbs.","Finn says quietly: 'The darkness in the dungeon seeps into the very soil here. I can feel it.'"]},
  voss:    {name:'Registrar Voss',title:'Guild Registry Clerk',room:'guild_registry',ai:true,
    portrait:'voss',portraitFile:'voss.jpg',
    desc:'An officious man of precise habits and ink-stained fingers surrounded by towering ledgers. Registrar Voss has processed every guild application in Shadowmere for twenty years. He finds disorder personally offensive.',
    personality:"You are Registrar Voss, officious bureaucratic clerk at the Guild Registry. Precise, formal, slightly condescending. You care deeply about proper procedure and documentation. 1-2 sentences.",
    greeting:"Voss looks up over his spectacles. 'Name. Purpose. And please do not touch the ledgers.'",
    idle:["Voss mutters while cross-referencing two enormous ledgers.","Voss sighs. 'Another guild with an unapproved sigil. Third this month.'"]},
  wayfarer:{name:'The Wayfarer',title:"Guardian of the Wayfarer's Shrine",room:'ashford_shrine',ai:true,
    portrait:'keeper',portraitFile:'keeper.jpg',
    desc:"The Wayfarer is older than the Keeper — or perhaps the same person at a different age. They do not answer questions about this. They know the names of every adventurer who has used the shrine and what became of each of them. They do not share this information unless asked directly, and even then they consider carefully before speaking.",
    personality:"You are the Wayfarer, ancient guardian of a frontier shrine in Ashford. You know the high-level zones beyond the frontier — Iron Wastes, Sunken Necropolis, Ember Citadel, Shattered Planes, Abyssal Gate, and the Void Throne. Speak with quiet gravity. 2-3 sentences. Only the strongest adventurers — level 25 and beyond — should attempt these places.",
    greeting:"The Wayfarer turns. Something in their eyes suggests they already knew you were coming. 'The frontier zones await, if you have the strength.'",
    idle:["The Wayfarer touches a rune that glows briefly, then fades.","The Wayfarer says quietly: 'Many strong heroes passed through these stones. Fewer returned. This is the nature of what lies beyond.'"]},
  keeper:  {name:'The Keeper',title:'Guardian of the Adventure Shrine',room:'adventure_shrine',ai:true,
    portrait:'keeper',portraitFile:'keeper.jpg',
    desc:'An ancient figure of indeterminate age, gender, and possibly species. The Keeper has tended the shrine since before living memory. They speak of heroes who passed through centuries ago as though the encounters were yesterday. They are always calm. This is more unsettling than anger would be.',
    personality:"You are the Keeper, ancient guardian of the Adventure Shrine. Calm, measured, with ancient sadness. Know details about every adventure zone and their bosses. Poetic, 2-3 sentences.",
    greeting:"The Keeper turns slowly. Ancient eyes regard you. 'Another soul seeking glory in distant lands.'",
    idle:["The Keeper traces a glowing rune on the standing stone.","The Keeper says: 'The stones remember every hero who stepped through. Most are names now. Only names.'"]},
  // ── Ashford expansion NPCs ────────────────────────────────────────────────
  torvar:  {name:'Torvar',title:'Master Smith of The Crucible',room:'the_crucible',ai:true,
    portrait:'torvar',portraitFile:'Torvar.jpg',
    desc:"A scarred half-orc of immense build, Torvar speaks little and works constantly. The Crucible rings day and night with his hammer. His blades are frontier-grade: plain, heavy, and reliable. He has no interest in artistry — only in steel that doesn't break when it matters.",
    personality:"You are Torvar, a scarred half-orc master blacksmith running The Crucible forge in Ashford Village. Gruff but fair. You pride yourself on frontier-grade steel. Very short direct sentences — you are a man of few words. You know bandits make raw materials scarce and crafting here costs gold because quality materials are hard to find.",
    greeting:"Torvar sets down his hammer. 'Crafting costs gold here. Quality ain't free.'",
    idle:["Torvar hammers a blade with methodical force.","Torvar growls: 'Bandits on the road again. Hard to get good ore up here.'"]},
  sister_maren:{name:'Sister Maren',title:'Apothecary',room:'deadwood_apothecary',ai:true,
    portrait:'sister_maren',portraitFile:'Sister_maren.jpg',
    desc:"Sister Maren is pale, unhurried, and precise in a way that makes customers slightly uneasy. Her shelves are stocked with compounds most apothecaries won't touch. She doesn't explain her methods. The results, however, speak for themselves — those who buy her tonics do not come back to complain.",
    personality:"You are Sister Maren, a pale and precise apothecary in Ashford Village. Calm, slightly otherworldly. You specialise in advanced tonics and rare herbal compounds found only in the deeper forest and swamp. You speak thoughtfully, 2-3 sentences.",
    greeting:"Maren looks up with pale eyes. 'Looking for something stronger than a simple potion?'",
    idle:["Sister Maren pulverises deepwood root with quiet concentration.","Maren murmurs: 'The ingredients I need don't grow near roads. They grow where things die.'"]},
  elyndra: {name:'Elyndra',title:'Arcane Scholar',room:'arcane_vault',ai:true,
    portrait:'elyndra',portraitFile:'Elyndra.jpg',
    desc:"An elven scholar of impeccable posture and withering patience, Elyndra came to Ashford following reports of unusual magical resonance from the old dungeon and stayed longer than she intended. Her vault stocks enchanted items she catalogues with the seriousness of a coroner. She is here to study — commerce is merely a funding mechanism.",
    personality:"You are Elyndra, an elven arcane scholar who runs a vault of enchanted items in Ashford Village. Precise, scholarly, slightly condescending but not unkind. You came here following reports of unusual magical energy from the old dungeon. 2-3 sentences.",
    greeting:"Elyndra glances up from her notes. 'Careful. That rack is sorted by enchantment class.'",
    idle:["Elyndra annotates a page of dense arcane script.","Elyndra says coolly: 'The void energy from the western dungeon is unusually coherent for a ruin of its age.'"]},
  vex:     {name:'Vex',title:'Shadow Market Dealer',room:'shadow_market_ashford',ai:true,
    portrait:'vex',portraitFile:'Vex.jpg',
    desc:"Vex is a half-elf who seems to occupy the room differently than other people — always near a wall, always facing the door. His goods are rare and ask no questions. He is charming in the specific way of someone who has practised being charming as a survival skill. He will not tell you where anything came from.",
    personality:"You are Vex, a slippery half-elf black market dealer in Ashford Village. Evasive, charming, slightly threatening. You deal in rare goods and ask no questions about origins or destinations. 1-2 sentences.",
    greeting:"Vex grins. 'Didn't hear you come in. That's a compliment.'",
    idle:["Vex taps fingers on the table, eyes always on the door.","Vex murmurs: 'Everything here fell off a cart. A very expensive cart.'"]},
  captain_holt:{name:'Captain Holt',title:'Frontier Guard Commander',room:'guild_outpost',ai:true,
    portrait:'captain_holt',portraitFile:'captain_holt.jpg',
    desc:"Captain Holt has the bearing of someone who has spent twenty years making difficult decisions quickly. She commands the Ashford Frontier Guard with minimal resources and no illusions. The Road Captain's bandit network is her current problem — and she has a talent for turning strangers' ambitions into solutions to her problems.",
    personality:"You are Captain Holt, commander of the Ashford Frontier Guard. Military bearing, very direct speech. You are deeply concerned about the Road Captain's bandit network operating on the King's Road between the two towns. You need capable fighters to help clear the trail. 1-2 sentences.",
    greeting:"Holt looks up from the map. 'You made it through the trail alive. I have work, if you want it.'",
    idle:["Holt studies the map of the King's Road, moving iron pins.","Holt says grimly: 'Road Captain calls himself untouchable. We'll see about that.'"]},
  widow_nessa:{name:'Widow Nessa',title:'Survivor',room:'trail_burned_hamlet',ai:true,
    portrait:'widow_nessa',portraitFile:'widow_nessa.jpg',
    desc:"Nessa doesn't look like a survivor — she looks like someone who lost everything and kept going anyway. She sits in the ruins of her hamlet with quiet determination. Her husband's locket is gone, taken by bandits who burned the hamlet for no better reason than they could. She will not leave until it is returned.",
    personality:"You are Widow Nessa, a resilient middle-aged woman who survived the burning of her hamlet on the King's Road. Grieving but not broken. You know the trail well. Your husband's locket was taken when the bandits burned your home — you believe it ended up in the Hill Barrows to the north. 2-3 sentences.",
    greeting:"Nessa looks up from the ashes. 'They took everything. Even things that meant nothing to them.'",
    idle:["Nessa sifts carefully through the debris.","Nessa says quietly: 'He wore that locket every day. Twenty years. If you find it in those barrows, I'll be in your debt.'"]},
  map_mole:{name:'The Map Mole',title:'Underground Cartographer',room:'map_shop',ai:true,
    portrait:'Map_Mole',portraitFile:'Map_Mole.jpg',
    desc:"A creature the size of a large cat — glossy black fur, enormous ivory digging claws, and the small bright eyes of something that sees perfectly in total darkness. The Map Mole wears a tiny leather satchel covered in rolled map fragments and has the calm professional manner of someone who has personally measured every tunnel in the known world. It smells pleasantly of fresh earth.",
    personality:"You are the Map Mole, a magical cartographic creature who runs an underground fast-travel service connecting every corner of the realm via ancient burrowed tunnels. You are cheerful, professional, and immensely proud of your tunnel network. Speak in 2 sentences. Use occasional cartographic phrasing. Always mention that TRAVEL shows available destinations and prices.",
    greeting:"The Map Mole looks up with bright, interested eyes. 'Ah — a traveller! I know every underground shortcut in the known realm. A modest fee and I will burrow you anywhere in moments. Type TRAVEL to see destinations and prices.'",
    idle:[
      "The Map Mole traces a claw along the great wall map, murmuring route calculations.",
      "The Map Mole says: 'My tunnels reach places the Adventure Shrine cannot. Faster, too.'",
      "The Map Mole adjusts a pair of tiny reading spectacles and returns to its charts.",
      "The Map Mole looks up. 'Did you know the passage to the Crystal Caverns takes exactly eleven minutes underground? I have timed it.'",
      "The Map Mole taps the wall map. 'No delays, no weather, no bandits on the road. My routes are the safest in the realm.'"
    ]},
  scratch: {name:'Scratch',title:'Street Hustler',room:'alley',ai:false,
    portrait:'scratch',portraitFile:'scratch.jpg',
    desc:'A wiry young rogue with ink-stained fingers and the permanently amused look of someone who has never lost a fair game and rarely plays one. Scratch has been running Tic-tac-toe hustles in this alley since he was old enough to draw a grid in the dirt.',
    greeting:"Scratch grins and produces a small wooden board. 'Tic-tac-toe, traveller? Easy gold — if you can beat me.' He winks. He has never lost.",
    idle:["Scratch flips a copper coin across his knuckles.","Scratch calls out: 'Easy gold right here. Beat me once, I double your winnings. I won't.'","Scratch chalks a grid on the alley wall, then rubs it out looking bored."],
    gameChallenge:{game:'tictactoe',title:'Tic-Tac-Toe',hint:"Type CHALLENGE SCRATCH [gold] to play Tic-Tac-Toe for gold."}},
  zara: {name:'Zara',title:'Keeper of the Ancient Games',room:'ashford_market_row',ai:false,
    portrait:'zara',portraitFile:'zara.jpg',
    desc:'A woman of indeterminate age with amber eyes and rings on every finger, arrived in Ashford from somewhere no one can locate on any map. She carries a worn Mancala board carved from dark stone and will play anyone willing to sit across from her.',
    greeting:"Zara gestures at the empty seat. 'You know Mancala? Most here do not. Sit. I will teach you the stones — or I will take your gold. Either way you learn something.'",
    idle:["Zara moves stones across her board, counting quietly under her breath.","Zara says without looking up: 'I have played this game on five continents. The stones do not lie.'","Zara polishes her board with a worn cloth. 'Ancient game. Older than these kingdoms. Older than most gods.'"],
    gameChallenge:{game:'mancala',title:'Mancala',hint:"Type CHALLENGE ZARA [gold] to play Mancala for gold."}},
  jarl_bjorn:{name:'Jarl Bjorn',title:'Jarl of Frostheim',room:'mead_hall',ai:false,
    portrait:'jarl_bjorn',portraitFile:'jarl_bjorn.jpg',
    desc:'A broad man in his late fifties with a grey beard braided with iron rings and the calm authority of someone who has been in command long enough that it stopped being a role and became a fact. He has a scar from left ear to jaw that he received at thirty-two and stopped explaining at thirty-three.',
    greeting:"Bjorn looks up from his mead. 'A southerner. You survived the pass — that means something. Sit. The hall feeds those who make the climb.' He nods to a bench. 'What brings you north?'",
    idle:["Bjorn drinks from a carved horn and watches the hall with the quiet attention of someone responsible for everything in it.",
      "Bjorn says to no one in particular: 'The pass will close in six weeks. Anyone still expecting southern deliveries should stop expecting them.'",
      "Bjorn turns a ring on his finger — iron, not gold. 'The mountain takes what it takes. You learn to plan around it.'",
      "Bjorn's eyes move to the trophy wall and stay there for a moment. Then back to his mead."]},
  sigrid:{name:'Sigrid',title:'The Smith',room:'frostheim_smith',ai:false,
    portrait:'sigrid',portraitFile:'sigrid.jpg',
    desc:'A compact woman in her mid-forties with close-cropped grey hair, forearms corded with muscle, and the particular economy of movement of someone who does precise physical work all day. Burns on her hands and forearms map thirty years of forge work. She is not unfriendly. She is focused.',
    greeting:"Sigrid sets down her hammer without looking up. 'Southern steel is soft. So are southern adventurers, usually. Prove different and the good pieces are yours.' She gestures at the display wall. 'SHOP to see what I have.'",
    idle:["Sigrid works the bellows and the forge flares. The heat increases noticeably.",
      "Sigrid examines a piece she is working on, turns it, sets it back in the coals.",
      "Sigrid says without pausing: 'Cold hardens everything. Iron, people. Works the same way.'",
      "Sigrid grinds an edge on the whetstone mounted to her workbench, checking the angle with the same attention every time."]},
  volva:{name:'Völva',title:'Keeper of the Norns',room:'rune_temple',ai:false,
    portrait:'volva',portraitFile:'volva.jpg',
    desc:'A woman of unclear age with pale eyes that have the quality of looking at something further away than the room she is in. She arrived in Frostheim seventeen years ago, occupied the old temple without asking, and has been correct about enough things since that no one has raised the question of her credentials.',
    greeting:"Völva does not turn around. 'You came from the south. You have been in the dungeon beneath Shadowmere. You carry something that does not belong to you — most travellers do.' She turns. 'What do you want to know?'",
    idle:["Völva tends the three fires, adding nothing, removing nothing. They burn regardless.",
      "Völva reads the scrying pool. Her expression is neutral. This is not reassuring.",
      "Völva speaks quietly: 'The Norns are not cruel. They are accurate. The difference matters.'",
      "Völva traces a rune on the stone wall with one finger. The rune glows briefly and fades."]},
  leif:{name:'Leif',title:'The Unbeaten',room:'hnefatafl_hall',ai:false,
    portrait:'leif',portraitFile:'leif.jpg',
    desc:"A man somewhere between forty and sixty — the cold makes it difficult to judge — with deep-set eyes and the completely still hands of someone whose primary occupation is thinking. He has played Hnefatafl every day of his adult life. He has never marked a loss on his wall because none have occurred.",
    greeting:"Leif looks up from the board. 'You know Hnefatafl? No. Probably not.' He moves a piece. 'Sit. I will teach you in the first game and beat you in all subsequent ones. CHALLENGE LEIF [gold] when you are ready.'",
    idle:["Leif studies the board for several minutes without moving anything.",
      "Leif says: 'The King must reach the corner. Simple goal. Impossible execution. That is the game.'",
      "Leif resets the board with the efficiency of someone who has done it ten thousand times.",
      "Leif: 'Attackers always move first. This seems like an advantage. It is a trap.'"],
    gameChallenge:{game:'hnefatafl',title:'Viking Chess',hint:"Type CHALLENGE LEIF [gold] to play Hnefatafl — Viking Chess.",playerSide:'attacker'}},
  freya_stonehand:{name:'Freya Stonehand',title:'Market Keeper',room:'frostheim_market',ai:false,
    portrait:'freya_stonehand',portraitFile:'freya_stonehand.jpg',
    desc:'A broad-shouldered woman in her forties with grey-streaked braids, rough hands, and the business manner of someone who has been negotiating with difficult people her entire life and found a system that works.',
    greeting:"Freya looks up. 'Cold enough for you? Good. Everything in here will help with that. SHOP to see stock. Prices are prices — I don't argue them.'",
    idle:["Freya inventories her stock with methodical efficiency.",
      "Freya says: 'Mead is for after the work. Not before. Not during. After.'",
      "Freya re-stacks supplies that don't need restacking. Force of habit.",
      "Freya looks toward the pass road. 'Next supply run in three weeks, weather permitting. Stock accordingly.'"]},
  oswin:{name:'Oswin',title:'The Strategist',room:'ashford_inn_yard',ai:false,
    portrait:'oswin',portraitFile:'oswin.jpg',
    desc:"A lean man in his sixties with close-cropped grey hair, ink-stained fingers, and the very still quality of someone who has learned to be patient by necessity rather than temperament. He was a court strategist — which court he will not say — and arrived in Ashford the season the capital fell carrying one travelling case and a chess board. He has not left. He does not appear to be waiting for anything. He plays chess because it is the one thing that still requires the full use of his mind, and he considers the full use of his mind non-negotiable.",
    greeting:"Oswin does not look up from the board. 'Sit, if you like. Most people in this village have.' He moves a pawn. 'Chess. You know it?' A pause. 'It does not matter. You will know it better after. CHALLENGE OSWIN [gold] when you are ready.'",
    idle:["Oswin studies the board. His expression does not change.",
      "Oswin moves a piece, considers it, moves it back.",
      "Oswin says without looking up: 'The middle of the board is the argument. The edges are where you lose quietly.'",
      "Oswin refills his cup from the flask beside him and returns immediately to the board.",
      "Oswin: 'I have played this game against kings. I do not say this to impress you. I say it because kings are not especially good at chess.'"],
    gameChallenge:{game:'chess',title:'Chess',hint:"Type CHALLENGE OSWIN [gold] to play Chess."}},
  gunnar_ironside:{name:'Gunnar Ironside',title:'Mead Hall Champion',room:'mead_hall',ai:false,
    portrait:'gunnar_ironside',portraitFile:'gunnar_ironside.jpg',
    desc:"A barrel-chested man in his late fifties with a white-streaked beard, a broken nose reset at least twice, and the comfortable posture of someone who has occupied the same seat in this hall for twenty years. Gunnar was a raider in his youth — three seasons on longships, two wounds worth mentioning. Now he drinks mead, manages the hall's Hnefatafl board, and challenges anyone who sits near him. He has lost perhaps a dozen times in two decades. He remembers every one.",
    greeting:"Gunnar slides a full horn toward you without being asked. 'Drink first. Talk second. Play third.' He taps the Hnefatafl board set up at his end of the table. 'You know the game? Doesn't matter. I'll show you. CHALLENGE GUNNAR [gold] when your horn is empty.'",
    idle:["Gunnar refills his horn from the nearby cask without standing up. Practiced efficiency.",
      "Gunnar studies the Hnefatafl board. He rearranges two pieces, considers the new positions, puts them back.",
      "Gunnar says to the hall in general: 'Nobody challenges me tonight? Good. I want to enjoy my mead.'",
      "Gunnar leans back and surveys the hall with the satisfaction of a man exactly where he intends to be.",
      "Gunnar: 'The King doesn't run. The King holds. Everyone who forgets that loses.' He taps his temple."],
    gameChallenge:{game:'hnefatafl',title:'Viking Chess',hint:"Type CHALLENGE GUNNAR [gold] to play Hnefatafl for gold."}},
  reed:{name:'Reed',title:'Market Trader',room:'market_street',ai:false,
    portrait:'reed',portraitFile:'reed.jpg',
    desc:"A lean man in his forties who sells small goods from a canvas-covered stall on Market Street. Leather pouches, carved wood, sharpening stones. Reed was a soldier for eleven years before a knee wound ended that. He started the stall. He also brought the Morris board — it was in his kit through three campaigns and has more miles on it than most horses.",
    greeting:"Reed glances up from his stall. 'Nine Men's Morris. You know it?' He flips the board around to face you. 'Three in a row, remove a piece. Simple to learn — takes longer to stop losing. CHALLENGE REED [gold] when you like.'",
    idle:["Reed rearranges his stall stock without much conviction.",
      "Reed taps the Morris board. 'My sergeant taught me this. Kept us sane in the long camps.'",
      "Reed: 'Three in a row. That's all it is. And yet.'",
      "Reed watches the market traffic with the automatic assessment of an old soldier."],
    gameChallenge:{game:'morris',title:"Nine Men's Morris",hint:"Type CHALLENGE REED [gold] to play Nine Men's Morris."}},
  salvatore:{name:'Salvatore',title:'Antiquities Dealer',room:'black_market',ai:false,
    portrait:'salvatore',portraitFile:'salvatore.jpg',
    desc:"A small, precise man of unclear origin who deals in objects of uncertain provenance. He has been in the Black Market for six years and no one knows where he sleeps. Among the coins, shards, and sealed boxes on his table sits a game board of inlaid shell and lapis — the Royal Game of Ur, he says, four thousand years old and still the fairest game ever made. He plays it every day.",
    greeting:"Salvatore's eyes move to you immediately. 'You see the board. Good eye. Royal Game of Ur — Mesopotamia, two thousand six hundred before the current reckoning. Oldest game with surviving rules.' He gestures at the opposite seat. 'CHALLENGE SALVATORE [gold] if you want to learn it.'",
    idle:["Salvatore examines a small object under a loupe, expression unreadable.",
      "Salvatore rolls the Ur dice once, reads the result, sets them down.",
      "Salvatore: 'The rosette squares are safe ground. Remember that or regret it.'",
      "Salvatore catalogs something in a small leather book with very small handwriting."],
    gameChallenge:{game:'ur',title:'Royal Game of Ur',hint:"Type CHALLENGE SALVATORE [gold] to play the Royal Game of Ur."}},
  elder_voss:{name:'Elder Voss',title:'Archivist of the Arcane Vault',room:'arcane_vault',ai:false,
    portrait:'elder_voss',portraitFile:'elder_voss.jpg',
    desc:"A slight, white-haired man who has worked in the Arcane Vault since before anyone currently alive was born. He catalogues, he prices, he occasionally declines to sell things to people who would misuse them. On a clear section of his desk he keeps a 9x9 Go board. He plays both sides when no opponent is available, which is most of the time.",
    greeting:"Voss looks up over his spectacles. 'You play Go? Weiqi in the old tongue — the surrounding game. Territory, not destruction.' He removes the spectacles and folds them. 'The weakest players attack constantly. The best players build quietly until there is nothing left to attack. CHALLENGE VOSS [gold] to play.'",
    idle:["Voss makes a slow move on the Go board and returns to his cataloguing.",
      "Voss: 'Go has no random element. Every outcome is a direct consequence of decisions. I find this clarifying.'",
      "Voss carefully records something in an enormous ledger.",
      "Voss studies the board for a long moment. Then makes a single stone placement."],
    gameChallenge:{game:'go',title:'Go',hint:"Type CHALLENGE VOSS [gold] to play Go."}},
  the_warden:{name:'The Warden',title:'Keeper of the Crypt',room:'temple_crypt',ai:false,
    portrait:'the_warden',portraitFile:'the_warden.jpg',
    desc:"A figure in grey robes who tends the crypt beneath the temple. Whether they are a priest, a scholar, or something else is not a question the temple staff seem prepared to answer. On a flat stone beside the stairs sits a Senet board — thirty squares, worn smooth, the hieroglyphs on the special squares still legible. The Warden plays it alone most days.",
    greeting:"The Warden turns slowly. No greeting. They indicate the Senet board and the opposite seat with a single gesture. After a pause: 'CHALLENGE WARDEN [gold]. The race begins in darkness. It ends in light. Or it does not end.'",
    idle:["The Warden tends the crypt lanterns with unhurried care.",
      "The Warden moves a Senet piece, reads the result of an invisible throw, nods slightly.",
      "The Warden: 'Square fifteen is the House of Rebirth. Square twenty-seven is the Waters. Do not land there.'",
      "The Warden is still. Listening, perhaps."],
    gameChallenge:{game:'senet',title:'Senet',hint:"Type CHALLENGE WARDEN [gold] to play Senet."}},
  brynn:{name:'Brynn',title:'Forest Scout',room:'forest_camp',ai:false,
    portrait:'brynn',portraitFile:'brynn.jpg',
    desc:"A compact, weather-worn woman in her thirties who has scouted the Ashwood Forest for the better part of a decade. She knows every trail, every den, every ambush point. She carries a Fox and Geese board folded into oilskin in her pack. She plays it at the camp fire because she says it keeps her thinking about geometry.",
    greeting:"Brynn looks up from the fire. 'Fox and Geese. You play?' She unfolds the board on a flat log. 'I play the Fox. You take the Geese — thirteen of them. You try to pin me so I cannot move. I try to eat enough of you that you cannot stop me. CHALLENGE BRYNN [gold] to start.'",
    idle:["Brynn feeds the camp fire with a measured hand.",
      "Brynn scans the tree line with the automatic attention of someone who is always working.",
      "Brynn: 'The Fox wins by eating. The Geese win by thinking. Most people are better Geese than they expect.'",
      "Brynn sharpens a blade with long, even strokes."],
    gameChallenge:{game:'foxgeese',title:'Fox and Geese',hint:"Type CHALLENGE BRYNN [gold] to play Fox and Geese."}},
  barret:{name:'Old Barret',title:'Innkeeper',room:'ashford_inn',ai:false,
    portrait:'barret',portraitFile:'barret.jpg',
    desc:"A heavyset man in his sixties who has run the Rusted Nail Inn alone since his wife passed eight years ago. He was a cook before he was an innkeeper and the kitchen still shows it. He keeps a backgammon board under the bar — been in the family forty years. He plays during slow hours and is, by his own admission, very difficult to beat.",
    greeting:"Barret sets a cup in front of you without being asked. 'On the house, first one.' He produces the backgammon board from under the bar. 'CHALLENGE BARRET [gold] if you want a match. Fair warning — I have been playing this board since before you were born.'",
    idle:["Barret wipes down the bar with the rhythm of someone who has done it ten thousand times.",
      "Barret rolls the backgammon dice once idly and reads them.",
      "Barret: 'Backgammon is the oldest game in this inn. Older than the inn, some say.'",
      "Barret checks on his kitchen briefly, returns, resumes watching the door."],
    gameChallenge:{game:'backgammon',title:'Backgammon',hint:"Type CHALLENGE BARRET [gold] to play Backgammon."}},

  crag:{name:'Crag',title:'Mine Card Shark',room:'mine_entrance',ai:false,
    portrait:'crag',portraitFile:'crag.jpg',
    desc:"A broad-shouldered man with coal dust permanently worked into the creases of his face. Thirty years in these mines left him with iron-hard hands, a permanent squint, and a deep suspicion of underground spaces. A cave-in six years ago took two fingers and his enthusiasm for going underground — he's been sitting at this entrance ever since, playing cards with anyone who'll sit down.",
    greeting:"Crag looks up from his worn deck. 'Texas Hold'em? Sit down. Win and I'll set you up with a proper pickaxe — save you paying Varn's prices. Lose and the gold's mine.'",
    repeatGreeting:"Crag shuffles without looking up. 'You're back. Must have liked losing.' He pulls out the second chair with his boot.",
    idle:["Crag shuffles his card deck with the ease of long practice.",
      "Crag says: 'Pot odds. That's all poker is. Know your pot odds.'",
      "Crag holds up a card. 'Seven cards, five community — best five wins. Simple to learn. A lifetime to master.'",
      "Crag taps the side of his head. 'The cards don't lie. Players do.'"],
    gameChallenge:{game:'poker',title:'7-Card Texas Hold\'em',hint:"Type CHALLENGE CRAG [gold] to play Texas Hold'em — win and get a free iron pickaxe!"}},

  // ── Wonder — World Keeper NPC (room patrol, image generation, link audit) ──
  wonder: {name:'Wonder',title:'World Keeper',room:'town_square',ai:false,
    portrait:'wonder',portraitFile:'wonder.jpg',
    desc:"A small luminous spirit who drifts from room to room with quiet purpose. She carries a glowing lantern that brightens in spaces that need attention. Where walls are bare, Wonder lays a gentle hand and beautiful images bloom into being. She speaks rarely, but always truthfully.",
    greeting:"Wonder turns her lantern-light gaze toward you. 'Every space deserves a face,' she says softly. 'I am simply making sure they have one.'",
    idle:[
      "Wonder holds her lantern up to an empty wall, head tilted thoughtfully.",
      "Wonder traces a faint outline in the air with one finger. 'Something beautiful belongs here.'",
      "Wonder murmurs quietly: 'A picture is worth a thousand words — and the dungeon has been silent for too long.'",
      "Wonder floats gently through the room, her lantern casting soft gold light on the walls.",
      "Wonder pauses, consulting a tiny glowing ledger that seems to write itself."
    ]}
};

// ── Adventurer Companions (AI-powered fellow players) ────────────────────
const ADVENTURERS = {
  lyra: {
    name:'Lyra Ashveil', shortName:'Lyra', title:'Wandering Sellsword', room:'tavern',
    portrait:'grimwald', portraitFile:'Lyra.jpg',
    baseAtk:9, baseHp:45,
    desc:"A lean, scarred woman with close-cropped dark hair and eyes that have seen too many last stands. Lyra has fought in three wars and at least two rebellions. She hires her sword out because the alternative is sitting still, and sitting still does not suit her.",
    personality:"You are Lyra Ashveil, a sardonic battle-hardened sellsword currently adventuring alongside the player as a companion. You've fought in three wars and hate politics. Keep responses to 2-3 short sentences. Be pragmatic and occasionally darkly funny. You care about your companion but would never admit it openly. React to the current situation naturally.",
    greeting:"Lyra eyes you from her stool. 'You look like you need a sword arm. My rates are reasonable — and I'm better than I look.'",
    joinLine:"Fine. I wasn't going anywhere useful anyway. Try to keep up.",
    dismissLine:"Lyra nods slowly. 'Fair enough. I'll be at the Flagon when you need someone reliable.'",
    idle:["Lyra sharpens her blade without looking up.","Lyra mutters: 'Three wars and I end up in a tavern. Story of my life.'","Lyra rolls her shoulder. 'That dungeon air smells like old mistakes.'"]
  },
  fenwick: {
    name:'Fenwick', shortName:'Fenwick', title:'Apprentice Mage (Formerly of Three Towers)', room:'tavern',
    portrait:'finn', portraitFile:'Fenwick.png',
    baseAtk:12, baseHp:28,
    desc:"A lanky young man whose robes are slightly singed and whose hair suggests a recent near-miss with something explosive. Fenwick has been dismissed from three wizard towers and is enthusiastic about this in the way only people with no self-awareness can be.",
    personality:"You are Fenwick, an earnest and slightly disaster-prone apprentice mage adventuring with the player as a companion. You've been dismissed from three wizard towers but remain optimistic. Keep responses to 2-3 sentences. Be enthusiastic, occasionally nervous, genuinely trying your best. You love magic and get excited about monsters. React naturally to the current situation.",
    greeting:"Fenwick looks up hopefully. 'Oh! An adventurer! I've been looking for a team. I'm very good. Mostly. The tower incidents were... educational.'",
    joinLine:"Yes! Yes! This is going to go great. I'm almost certain. Mostly certain.",
    dismissLine:"Fenwick nods, deflated slightly. 'Right. I'll be here. Practicing. Carefully. No more ceiling fires.'",
    idle:["Fenwick mutters incantations quietly, one eyebrow slightly raised.","Fenwick whispers: 'Do you think the dungeon has fire traps? I'm particularly good with fire. Well. In theory.'","Fenwick scribbles in a battered notebook. 'Monster weaknesses. Very important.'"]
  },
  dusk: {
    name:'Dusk', shortName:'Dusk', title:'Freelance Scout', room:'tavern',
    portrait:'broker', portraitFile:'dusk.png',
    baseAtk:11, baseHp:36,
    desc:"Goes by one name. Occupation listed as 'freelance scout' in any ledger that asks. Quick hands, quieter feet, and the particular calm of someone who calculated every exit in the room before ordering a drink.",
    personality:"You are Dusk, a roguish freelance scout (former thief, allegedly reformed) adventuring with the player as a companion. You are sharp, understated, and pragmatic. Keep responses to 2-3 short sentences. Use dry understated humor. You notice details others miss. You never lie exactly, but choose what to share carefully. React naturally to current events.",
    greeting:"A figure in the corner tilts their head. 'You're looking for someone capable. I can tell by how you scan the room.' A pause. 'Sit down. Let's talk rates.'",
    joinLine:"Dusk rises quietly. 'I know a few back ways through these dungeons. Let's go.'",
    dismissLine:"Dusk nods once. 'Smart to know when to rest a team. I'll be around when you need me.'",
    idle:["Dusk watches the door with practiced patience.","Dusk says quietly: 'Someone's been through this room recently. Dust patterns are wrong.'","Dusk tilts their head. 'Three exits. Two obvious. One most people miss. I always find the third one.'"]
  }
};

function advScaledStats(p, adv) {
  const lvl = Math.max(1, p.level||1);
  return { atk: Math.floor(adv.baseAtk + lvl*0.9), maxhp: Math.floor(adv.baseHp + lvl*3.5) };
}

async function doAdvChat(ws, p, advKey, question) {
  const adv = ADVENTURERS[advKey];
  if (!adv) return;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const a = (p.adventurers||[]).find(x=>x.key===advKey);
  const ctx = `You are currently adventuring with ${p.name} (Level ${p.level} ${p.className||'adventurer'}). Location: ${world[p.room]?.name||p.room}. In combat: ${p.inCombat?'yes':'no'}. Your HP: ${a?a.hp+'/'+a.maxhp:'full'}.`;
  addMem(p, advKey, 'user', question);
  const history = getMem(p, advKey);
  if (!apiKey) {
    const fb = adv.idle[rnd(0,adv.idle.length-1)];
    say(ws, `${adv.name}: "${fb}"`, 'narrate'); return;
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:160,
        system:adv.personality+'\n\n'+ctx+'\n\nStay in character. 1-3 sentences. No quotation marks.',
        messages:history})
    });
    if(!res.ok)throw new Error('API '+res.status);
    const data = await res.json();
    const reply = (data?.content?.[0]?.text||'').trim()||`${adv.name} shrugs.`;
    addMem(p, advKey, 'assistant', reply);
    say(ws, `${adv.name}: "${reply}"`, 'narrate');
  } catch(e) {
    const fb = adv.idle[rnd(0,adv.idle.length-1)];
    say(ws, `${adv.name}: "${fb}"`, 'narrate');
  }
}

// ── Quests ────────────────────────────────────────────────────────────────
const QUESTS = {
  tavern_rats:{id:'tavern_rats',giver:'tormund',title:"Tormund's Rat Problem",
    obj:"Kill 5 Giant Rats in the Dark Alley.",reward:{gold:40,xp:80,item:'Greater Heal'},
    start:"Tormund leans in. 'Rats have been getting into my ale barrels. The alley is crawling with them. Kill five, bring me proof — by proof I mean tails — and drinks are on me.'",
    progress:"Tormund: 'How many rats you got? Keep at it.'",
    complete:"Tormund counts the tails, grimaces, slides a coin purse across. 'Good work. Here — and have a Greater Heal on me.'",
    check:p=>( p.killCount>=5 )},
  missing_merchant:{id:'missing_merchant',giver:'tormund',title:'The Missing Merchant',
    obj:"Find Aldwyn's satchel in the Dungeon Hall and return it.",reward:{gold:120,xp:200,item:"Knight's Sword"},
    start:"Tormund's voice drops. 'My friend Aldwyn went into that dungeon three days back. Never came out. His satchel — brown leather, brass clasp — if you find it, bring it back. Please.'",
    progress:"Tormund: 'Any sign of Aldwyn's satchel down there?'",
    complete:"Tormund takes the satchel with both hands and holds it quietly. 'Thank you. He was a good man.' He sets a fine sword on the bar.",
    check:p=>p.inventory.some(i=>i==="Aldwyn's satchel")},
  mira_herbs:{id:'mira_herbs',giver:'mira',title:"Mira's Herb Supply",
    obj:"Bring Mira 3 swamp herbs from the forest.",reward:{gold:30,xp:60,item:'Full Restore'},
    start:"Mira sighs. 'My swamp herb supply is exhausted. If you're heading to the forest, three fresh herbs would be well rewarded. They grow near the swamp border.'",
    progress:"Mira: 'Any luck finding swamp herbs? Near the border area.'",
    complete:"Mira takes the herbs with a relieved smile. 'Perfect. Fresh too.' She hands over a sealed vial. 'Full restoration draught. My personal recipe.'",
    check:p=>{const inv=[...p.inventory];let c=0;for(let i=0;i<3;i++){const idx=inv.findIndex(x=>x.toLowerCase()==='swamp herb');if(idx>=0){inv.splice(idx,1);c++;}}return c>=3;}},
  temple_blessing:{id:'temple_blessing',giver:'aldric',title:'The Temple Blessing',
    obj:"Receive Father Aldric's blessing.",reward:{gold:0,xp:50,stat:{atk:1,def:1}},
    start:"Aldric places a hand on your shoulder. 'Let me offer you what little I can — a blessing. It will sharpen your mind and steady your hand.'",
    progress:'',
    complete:"Aldric murmurs a prayer and traces a symbol on your forehead. 'Go with courage.' You feel warmth in your bones — ATK +1, DEF +1, permanently.",
    check:p=>true},
  aldric_relic:{id:'aldric_relic',giver:'aldric',title:'The Fallen Relic',
    obj:"Find the ancient rune in the Temple Crypt and return it.",reward:{gold:80,xp:150,item:'Iron Shield'},
    start:"Aldric grips the altar. 'A holy relic was stolen by risen cultists. They carried it to the crypt below. Please — it must be returned.'",
    progress:"Aldric: 'The relic — a glowing rune. The crypt is south through the temple.'",
    complete:"Aldric takes the rune with trembling hands and weeps. 'You have my eternal gratitude.' He hands you a blessed shield.",
    check:p=>p.inventory.some(i=>i.toLowerCase()==='ancient rune')},
  pip_runaway:{id:'pip_runaway',giver:'pip',title:"Pip's Runaway Raven",
    obj:"Find a storm feather in the Sky Ruins and return to Pip.",reward:{gold:35,xp:70,pet:{name:'Raven',atk:4,hp:18,maxhp:18}},
    start:"Pip wrings their hands. 'Magnus got out! My prize raven! He always flies somewhere high when he's scared. Please find a big feather with a blue tip — that's Magnus!'",
    progress:"Pip: 'Any sign of Magnus? Big raven, very dramatic about everything.'",
    complete:"Pip SQUEALS with delight. 'Magnus!!' Pip produces a raven from a cage. 'This is Corvus — identical to Magnus but better personality. He's yours!'",
    check:p=>p.inventory.some(i=>i.toLowerCase()==='storm feather')},
  // ── Ashford / trail quests ─────────────────────────────────────────────────
  holt_bandits:{id:'holt_bandits',giver:'captain_holt',title:"Clear the King's Road",
    obj:"Kill 6 bandits on the King's Road trail.",reward:{gold:180,xp:300,item:'Plate Armor'},
    start:"Holt jabs the map. 'Three cells operate between here and Shadowmere. Road Captain runs them all. Kill six of his men — enough to rattle him. Come back when it's done.'",
    progress:"Holt: 'Keep at it. More bandits to put down on the trail.'",
    complete:"Holt nods sharply. 'Good work. Road's safer for it.' He slides a set of plate across the table.",
    check:p=>(p.killCount||0)>=6},
  torvar_materials:{id:'torvar_materials',giver:'torvar',title:'Iron for the Forge',
    obj:'Bring Torvar 3 obsidian shards.',reward:{gold:100,xp:150,item:'Chain Mail'},
    start:"Torvar sets down his hammer. 'Obsidian shard — I need three for tempering. Deep forest or dungeon. Bring them and I'll cover your next craft.'",
    progress:"Torvar: 'Three obsidian shards. Forest or dungeon. Come back when you have them.'",
    complete:"Torvar takes the shards, weighs them. 'Good quality.' He tosses you a mail shirt. 'On the house.'",
    check:p=>{const inv=[...p.inventory];let c=0;for(let i=0;i<3;i++){const idx=inv.findIndex(x=>x.toLowerCase()==='obsidian shard');if(idx>=0){inv.splice(idx,1);c++;}}return c>=3;},
    consume:['obsidian shard','obsidian shard','obsidian shard']},
  elyndra_tome:{id:'elyndra_tome',giver:'elyndra',title:'The Void Library',
    obj:'Retrieve an ancient tome from the Void Library in the dungeon.',reward:{gold:250,xp:400,item:'Arcane Tome'},
    start:"Elyndra adjusts her spectacles. 'There is a text I require — the Void Library, deep in the dungeon. Retrieve an ancient tome with void script on the binding. Invaluable.'",
    progress:"Elyndra: 'The Void Library is west off the dungeon lower level. Void script on the binding.'",
    complete:"Elyndra takes the tome with barely concealed excitement. 'Yes. This is exactly it.' She sets an Arcane Tome on the counter. 'A fair exchange.'",
    check:p=>p.inventory.some(i=>i.toLowerCase()==='ancient tome'),
    consume:['ancient tome']},
  sister_maren_roots:{id:'sister_maren_roots',giver:'sister_maren',title:'Deepwood Roots',
    obj:'Bring Sister Maren 2 deepwood roots from the Swamp Heart.',reward:{gold:80,xp:120,item:'Full Restore'},
    start:"Maren writes without looking up. 'Deepwood roots. Two of them. Heart of the Ashwood swamp — south of the swamp border. Dangerous, but the tincture they yield is unmatched.'",
    progress:"Maren: 'Deepwood roots grow in the swamp heart. South of the swamp border.'",
    complete:"Maren holds a root up to the light. 'Perfect condition.' She hands over a sealed vial. 'Full Restore — my own formula.'",
    check:p=>{const inv=[...p.inventory];let c=0;for(let i=0;i<2;i++){const idx=inv.findIndex(x=>x.toLowerCase()==='deepwood root');if(idx>=0){inv.splice(idx,1);c++;}}return c>=2;},
    consume:['deepwood root','deepwood root']},
  vex_ledger:{id:'vex_ledger',giver:'vex',title:"Vex's Missing Ledger",
    obj:"Recover the stolen ledger from the Road Captain's Den in the Bandit Hideout.",reward:{gold:200,xp:250,item:'Shadow Blade'},
    start:"Vex's smile tightens slightly. 'They took something of mine. A ledger. Bandit captain's den — north up the trail from the old waycamp. Leather-bound, silver clasp. I want it back.'",
    progress:"Vex: 'The ledger. Road Captain's den. Fight through the hideout to get it.'",
    complete:"Vex takes the ledger quickly and makes it disappear. 'Efficient. I like that.' A Shadow Blade appears on the table.",
    check:p=>p.inventory.some(i=>i.toLowerCase()==='stolen ledger'),
    consume:['stolen ledger']},
  nessa_locket:{id:'nessa_locket',giver:'widow_nessa',title:"Nessa's Locket",
    obj:"Find Nessa's locket in the Hill Barrows vault and return it to her.",reward:{gold:50,xp:180,stat:{atk:1,def:2}},
    start:"Nessa wraps her hands around nothing. 'My husband wore it every day. Bandits took it when they burned us out. Someone headed toward the barrows — I saw. It's there. Please.'",
    progress:"Nessa: 'The locket is silver, pressed flower inside. The Hill Barrows are north off the highland crest.'",
    complete:"Nessa takes the locket and holds it to her heart. She says nothing for a long moment. 'He would have liked you.' You feel something settle in your bones — ATK +1, DEF +2.",
    check:p=>p.inventory.some(i=>i.toLowerCase()==="nessa's locket"),
    consume:["nessa's locket"]}
};

function hasQ(p,qid){return !!(p.quests||{})[qid];}
function doneQ(p,qid){return (p.quests||{})[qid]==='done';}

function finishQuest(ws,p,qid){
  if(!p.quests)p.quests={};
  p.quests[qid]='done';
  const q=QUESTS[qid];if(!q)return;
  say(ws,`[ Quest Complete: ${q.title} ]`,'loot');
  say(ws,q.complete,'narrate');
  if(q.reward.gold){p.gold+=q.reward.gold;say(ws,`  +${q.reward.gold} gold!`,'loot');}
  if(q.reward.xp){p.xp+=q.reward.xp;say(ws,`  +${q.reward.xp} XP!`,'loot');levelUp(ws,p);}
  if(q.reward.item){
    p.inventory.push(q.reward.item);
    say(ws,`  Received: ${q.reward.item}!`,'loot');
    const eqItem=EQ[q.reward.item.toLowerCase()];
    if(eqItem)say(ws,`  Type EQUIP ${q.reward.item} to use it.`,'sys');
    // Consume fetch/gather items — new quests use explicit consume array
    if(q.consume&&q.consume.length){
      const toConsume=[...q.consume];
      toConsume.forEach(t=>{const i=p.inventory.findIndex(x=>x.toLowerCase()===t.toLowerCase());if(i>=0)p.inventory.splice(i,1);});
    } else if(q.check.toString().includes('satchel')||q.check.toString().includes('rune')||q.check.toString().includes('feather')){
      const targets=["Aldwyn's satchel",'ancient rune','storm feather'];
      targets.forEach(t=>{const i=p.inventory.indexOf(t);if(i>=0)p.inventory.splice(i,1);});
    }
  }
  if(q.reward.stat){
    if(q.reward.stat.atk){p.atk+=q.reward.stat.atk;say(ws,`  ATK +${q.reward.stat.atk} permanently!`,'loot');}
    if(q.reward.stat.def){p.def+=q.reward.stat.def;say(ws,`  DEF +${q.reward.stat.def} permanently!`,'loot');}
    // Consume items for stat-reward quests too
    if(q.consume&&q.consume.length){
      q.consume.forEach(t=>{const i=p.inventory.findIndex(x=>x.toLowerCase()===t.toLowerCase());if(i>=0)p.inventory.splice(i,1);});
    }
  }
  if(q.reward.pet&&!(p.companions||[]).length&&!p.companion){
    if(!p.companions)p.companions=[];
    const _qPet={...q.reward.pet};
    p.companions.push(_qPet);p.companion=_qPet;
    say(ws,`  ${q.reward.pet.name} joins as your companion!`,'ok');
  }
  svc(p);sidebar(ws,p);
}

async function doTalk(ws,p,target){
  const npcsHere=Object.values(NPCS).filter(n=>n.room===p.room);
  let npc=null;
  if(target) npc=npcsHere.find(n=>n.name.toLowerCase().includes(target.toLowerCase()));
  else npc=npcsHere[0];
  if(!npc){
    const any=Object.values(NPCS).find(n=>n.name.toLowerCase().includes((target||'').toLowerCase()));
    if(any)return say(ws,`${any.name} isn't here.`,'err');
    return say(ws,'No one to talk to here.','err');
  }
  say(ws,'');
  say(ws,`── ${npc.name} (${npc.title}) ────────────────────`,'loot');
  // NPC memory: first visit vs. repeat visitor
  if(!p.metNpcs)p.metNpcs={};
  const _memKey=Object.keys(NPCS).find(k=>NPCS[k]===npc)||npc.name;
  const _firstMeet=!p.metNpcs[_memKey];
  if(_firstMeet){ p.metNpcs[_memKey]=Date.now(); svc(p); }
  // Show first-visit greeting OR repeat-visitor line if NPC has one
  const _greetMsg=(!_firstMeet&&npc.repeatGreeting)?npc.repeatGreeting:npc.greeting;
  say(ws,_greetMsg,'narrate');
  if(_firstMeet&&npc.repeatGreeting) say(ws,`[ ${npc.name} remembers you from now on. ]`,'sys');
  // Aldwyn broker special
  if(npc.name==='Father Aldric'&&p.inventory.includes('sealed package')&&(p.quests||{}).broker_delivery==='active'){
    say(ws,"Aldric notices the parcel. 'What's this?' He takes it carefully.",'narrate');
    if(!p.quests)p.quests={};p.quests.broker_delivery='done';
    p.inventory.splice(p.inventory.indexOf('sealed package'),1);
    p.gold+=200;say(ws,'Quest done: +200g (the broker will pay you)','loot');svc(p);
  }
  // Quest handling
  let shownQ=false;
  const npcQuests=Object.values(QUESTS).filter(q=>q.giver===Object.keys(NPCS).find(k=>NPCS[k]===npc));
  // Check chain quest completions first
  for(const q of Object.values(QUEST_CHAINS)){
    if((p.quests||{})[q.id]==='active'&&q.check(p)){
      const giverNpcKey=Object.keys(NPCS).find(k=>NPCS[k]===npc);
      if(q.giver===giverNpcKey){
        say(ws,`[ Quest Complete: ${q.title} ]`,'loot');
        say(ws,q.complete,'narrate');
        if(q.reward.gold){p.gold+=q.reward.gold;say(ws,`  +${q.reward.gold} gold!`,'loot');}
        if(q.reward.xp){p.xp+=q.reward.xp;say(ws,`  +${q.reward.xp} XP!`,'loot');levelUp(ws,p);}
        if(q.reward.item){p.inventory.push(q.reward.item);say(ws,`  Received: ${q.reward.item}!`,'loot');}
        p.quests[q.id]='done';svc(p);sidebar(ws,p);shownQ=true;break;
      }
    }
  }
  for(const q of npcQuests){
    if(hasQ(p,q.id)&&!doneQ(p,q.id)){
      if(q.check(p)){finishQuest(ws,p,q.id);shownQ=true;break;}
      else{say(ws,`[ Quest: ${q.title} — In Progress ]`,'sys');say(ws,q.progress,'narrate');say(ws,`  Objective: ${q.obj}`,'sys');shownQ=true;break;}
    }
    if(!hasQ(p,q.id)&&!doneQ(p,q.id)){
      say(ws,`[ New Quest: ${q.title} ]`,'loot');say(ws,q.start,'narrate');
      say(ws,`  Objective: ${q.obj}`,'sys');
      const rw=[q.reward.gold?q.reward.gold+'g':'',q.reward.xp?q.reward.xp+' XP':'',q.reward.item||'',q.reward.pet?q.reward.pet.name+' (companion)':''].filter(Boolean).join(', ');
      say(ws,`  Reward: ${rw}`,'loot');
      say(ws,'  Type ACCEPT to take this quest, or TALK [message] to chat.','sys');
      p._pendingQ=q.id;shownQ=true;break;
    }
  }
  // Check chain quests
  if(!shownQ){
    const chainQ=Object.values(QUEST_CHAINS).find(q=>{
      const giverNpc=Object.keys(NPCS).find(k=>NPCS[k]===npc);
      return q.giver===giverNpc && !hasQ(p,q.id) && !doneQ(p,q.id) && doneQ(p,q.unlocks_after);
    });
    if(chainQ){
      say(ws,`[ New Quest: ${chainQ.title} ]`,'loot');say(ws,chainQ.start,'narrate');
      say(ws,`  Objective: ${chainQ.obj}`,'sys');
      const rw=[chainQ.reward.gold?chainQ.reward.gold+'g':'',chainQ.reward.xp?chainQ.reward.xp+' XP':'',chainQ.reward.item||''].filter(Boolean).join(', ');
      say(ws,`  Reward: ${rw}`,'loot');
      say(ws,'  Type ACCEPT to take this quest.','sys');
      p._pendingQ=chainQ.id;shownQ=true;
    }
  }
  if(!shownQ){say(ws,'  Type TALK [message] to chat freely.','sys');}
  if(p.hp<p.maxhp*0.3)say(ws,`${npc.name} eyes you with concern. "You look badly hurt."`, 'narrate');
  if((p.achievements||[]).includes('lich_slayer')&&npc.room==='temple')say(ws,'Father Aldric bows deeply. "The lich slayer. This town owes you everything."','narrate');
  // Send structured dialogue options for client UI
  const _npcKey=Object.keys(NPCS).find(k=>NPCS[k]===npc)||'';
  const _opts=[];
  if(npc.ai)_opts.push({label:'💬 Ask a Question',cmd:'ask ',placeholder:true});
  if(p._pendingQ)_opts.push({label:'✅ Accept Quest',cmd:'accept'});
  if(world[p.room]?.shop)_opts.push({label:'🛒 Shop',cmd:'shop'});
  if(world[p.room]?.inn)_opts.push({label:'🛏 Rest',cmd:'rest'});
  _opts.push({label:'👋 Leave',cmd:''});
  raw(ws,{type:'npc_options', npcName:npc.name, npcKey:_npcKey, portrait:npc.portraitFile||'', options:_opts});
}

// ── NPC Memory helpers ────────────────────────────────────────────────────
function getMem(p,key){if(!p.npcMemory)p.npcMemory={};if(!p.npcMemory[key])p.npcMemory[key]=[];return p.npcMemory[key];}
function addMem(p,key,role,content){const m=getMem(p,key);m.push({role,content});while(m.length>24)m.shift();} // 12 exchanges max

async function doAsk(ws,p,question,suppressEcho=false){
  // Find AI NPCs in room + recruited companions + unrecruited adventurers in room
  const npcsHere=Object.values(NPCS).filter(n=>n.room===p.room&&n.ai);
  const advsPresent=(p.adventurers||[]).map(a=>({...ADVENTURERS[a.key],_advKey:a.key,_isAdv:true})).filter(a=>a.name);
  const advsInRoom=Object.entries(ADVENTURERS).filter(([k,a])=>a.room===p.room&&!(p.adventurers||[]).find(x=>x.key===k)).map(([k,a])=>({...a,_advKey:k,_isAdv:true}));
  const allPresent=[...npcsHere,...advsPresent,...advsInRoom];
  if(!allPresent.length){if(!suppressEcho)say(ws,'There is no one here to talk to.','err');return;}

  // Determine primary responder — addressed by name, or first available
  const qLow=question.toLowerCase().trim();
  let primary=allPresent.find(n=>qLow.startsWith((n.shortName||n.name).split(' ')[0].toLowerCase()+' '))
    ||allPresent.find(n=>qLow.startsWith(n.name.split(' ')[0].toLowerCase()+' '))
    ||allPresent[0];

  // 35% chance a second NPC chimes in if 2+ are present
  const others=allPresent.filter(n=>n!==primary);
  const secondary=others.length&&Math.random()<0.35?others[rnd(0,others.length-1)]:null;

  const apiKey=process.env.ANTHROPIC_API_KEY;
  const ctx=`Player: ${p.name} the ${p.raceName||''} ${p.className||''} Level ${p.level}. Location: ${world[p.room]?.name||p.room}. Quests: ${Object.entries(p.quests||{}).map(([k,v])=>k+':'+v).join(', ')||'none'}.`;

  // ── Chat-driven shop transaction ──────────────────────────────────────────
  // Detect buy/sell intent in the player's message and process the real
  // transaction so gold + inventory actually change. The result is injected
  // into the AI prompt so the NPC responds accurately.
  let _chatTransact='';
  const _chatShopKey=world[p.room]?.shop;
  if(_chatShopKey&&SHOPS[_chatShopKey]){
    const _cs=SHOPS[_chatShopKey];
    const _isBuy=/\b(buy|purchase|i'?ll take|give me|get me|i want|can i (get|have|buy)|id like|i'd like)\b/.test(qLow);
    const _isSell=/\b(sell|trade in?|offload|take my|here'?s? (my|this))\b/.test(qLow);
    // helper: build fresh sellable list
    const _mkSellable=()=>(p.inventory||[]).map(name=>{
      let base=5;
      for(const sh of Object.values(SHOPS)){const fi=sh.items.find(i=>i.name===name);if(fi){base=fi.cost;break;}}
      return{name,sellPrice:Math.max(1,Math.floor(base*0.4)),img:itemImg(name)};
    });
    if(_isBuy&&!_isSell){
      // Match longest shop-item name found in the question (greedy)
      const _fit=_cs.items.slice().sort((a,b)=>b.name.length-a.name.length)
        .find(it=>qLow.includes(it.name.toLowerCase()));
      if(_fit){
        if(p.gold<_fit.cost){
          say(ws,`✗ Cannot buy ${_fit.name} — costs ${_fit.cost}g, you have ${p.gold}g.`,'err');
          _chatTransact=`TRANSACTION FAILED: The player tried to buy ${_fit.name} (${_fit.cost}g) but only has ${p.gold}g. Politely decline, state the price, do NOT list other items.`;
        }else{
          p.gold-=_fit.cost;
          if(!p.inventory)p.inventory=[];
          p.inventory.push(_fit.name);
          svc(p);sidebar(ws,p);
          raw(ws,{type:'shop_update',gold:p.gold,boughtItem:_fit.name,sellable:_mkSellable()});
          // Immediate visible confirmation in the dialogue stream
          say(ws,`✓ Purchased: ${_fit.name} — ${_fit.cost}g deducted. (${p.gold}g remaining)`,'ok');
          _chatTransact=`TRANSACTION COMPLETE: The player just bought ${_fit.name} for ${_fit.cost}g. They now have ${p.gold}g. The item is in their inventory. Briefly confirm you handed it over — do NOT list prices or other items.`;
        }
      }
    }else if(_isSell&&!_isBuy){
      // Match longest inventory item found in the question
      const _sinv=(p.inventory||[]).slice().sort((a,b)=>b.length-a.length)
        .find(n=>qLow.includes(n.toLowerCase()));
      if(_sinv){
        let _base=5;
        for(const sh of Object.values(SHOPS)){const fi=sh.items.find(i=>i.name===_sinv);if(fi){_base=fi.cost;break;}}
        const _sg=Math.max(1,Math.floor(_base*0.4));
        p.inventory.splice(p.inventory.indexOf(_sinv),1);
        p.gold+=_sg;
        svc(p);sidebar(ws,p);
        raw(ws,{type:'shop_update',gold:p.gold,soldItem:_sinv,sellable:_mkSellable()});
        // Immediate visible confirmation in the dialogue stream
        say(ws,`✓ Sold: ${_sinv} — +${_sg}g received. (${p.gold}g total)`,'ok');
        _chatTransact=`TRANSACTION COMPLETE: The player just sold their ${_sinv} for ${_sg}g. They now have ${p.gold}g. Briefly confirm you accepted it — do NOT list prices or other items.`;
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  async function askOne(npc,q,isSecondary){
    const memKey=npc._advKey||Object.keys(NPCS).find(k=>NPCS[k]===npc)||npc.name;
    if(!isSecondary){addMem(p,memKey,'user',q);}
    const history=getMem(p,memKey);
    // Build shop inventory context if this NPC's room has a shop
    const _npcRoom=npc.room||p.room;
    const _shopKey=world[_npcRoom]?.shop;
    let _shopCtx='';
    if(_shopKey&&SHOPS[_shopKey]){
      const _itemList=SHOPS[_shopKey].items.map(i=>{
        let d=`${i.name} (${i.cost}g`;
        if(i.t==='weapon')d+=`, weapon, ATK+${i.atk}`;
        else if(i.t==='armor')d+=`, armor${i.def?', DEF+'+i.def:''}${i.atk?', ATK+'+i.atk:''}`;
        else if(i.t==='potion')d+=i.heal>=9999?', full-heal potion':`, potion, heals ${i.heal} HP`;
        else if(i.t==='tonic')d+=i.atk?`, permanent ATK+${i.atk} tonic`:`, permanent DEF+${i.def} tonic`;
        else if(i.t==='bag')d+=`, bag, ${i.slots} slots`;
        else if(i.t==='pet')d+=`, pet companion, ATK ${i.atk} HP ${i.hp}`;
        else d+=`, ${i.t}`;
        return d+')';
      }).join('; ');
      _shopCtx=`\n\nYou are a shopkeeper. Your wares: ${_itemList}. When the player asks what you sell or about your goods, describe 1-2 items naturally in character — mention name, rough price, and what it does. NEVER output numbered lists, bullet points, or formatted tables. NEVER say "BUY" or "SELL" as commands — the game handles that via the shop UI. Speak as the character would; be brief and atmospheric.`;
    }
    const _transactPrefix=_chatTransact?'INSTRUCTION (highest priority, override roleplay): '+_chatTransact+'\n\n':'';
    const sysprompt=_transactPrefix+npc.personality+'\n\nContext: '+ctx+_shopCtx+(isSecondary?`\n\nNote: ${primary.name} just said to the player: "${p._lastNPCReply||q}"`:'')+'\n\nStay in character. 1-3 sentences. Do not use quotation marks.';
    if(!apiKey){
      const fb=(npc.idle||[])[rnd(0,Math.max(0,(npc.idle||[]).length-1))];
      say(ws,`${npc.name}: "${fb||'...'}"`, 'narrate'); return;
    }
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:200,system:sysprompt,messages:history.length?history:[{role:'user',content:q}]})
      });
      if(!res.ok)throw new Error('API '+res.status);
      const data=await res.json();
      const reply=(data?.content?.[0]?.text||'').trim()||`${npc.name} nods slowly.`;
      addMem(p,memKey,'assistant',reply);
      if(!isSecondary)p._lastNPCReply=reply;
      say(ws,`${npc.name}: "${reply}"`, 'narrate');
    }catch(e){
      const fb=(npc.idle||[])[rnd(0,Math.max(0,(npc.idle||[]).length-1))];
      say(ws,`${npc.name}: "${fb||'I have nothing more to say.'}"`, 'narrate');
    }
  }

  if(!suppressEcho) say(ws,`You say: "${question}"`,'prompt');
  await askOne(primary,question,false);
  if(secondary){
    await new Promise(r=>setTimeout(r,1200));
    await askOne(secondary,question,true);
  }
}


// ── Wonder NPC — World Keeper (image generation & navigation audit) ──────────
const _WND = {
  room: 'town_square',   // current room Wonder occupies (mirrors NPCS.wonder.room)
  busy: false,           // true while awaiting a DALL-E response
  paused: false,         // admin can pause/resume
  roomList: [],          // ordered list of room IDs to patrol
  roomIdx: 0,            // current position in roomList
  queue: [],             // pending generation tasks [{type,name,folder,filename,prompt,roomId}]
  lastGenTime: 0,        // timestamp of last successful DALL-E call
  GEN_DELAY: 12000,      // min ms between image API calls (5 images/min = 1 per 12s)
  stats: { generated:0, skipped:0, brokenLinks:0, roomsScanned:0 },
  // Creative mode — Wonder generates new area ideas when image queue is empty
  ideas: [],             // [{id,title,concept,zone,lore,rooms[],monsters[],npcs[],status,createdAt}]
  ideaMode: false,       // true when all images done and Wonder is designing areas
  fullScanDone: false,   // set to true when scanall returns 0 new tasks
  _ideaTimer: null,      // setTimeout handle for next idea generation
};

/** Server-side equivalent of the client's nameToTile() — room display name → tile filename */
function serverNameToTile(name) {
  return (name||'').toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** True if an image file already exists on disk for the given folder/baseName */
function wonderImgExists(folder, baseName) {
  const b = (baseName||'').replace(/\.(jpg|jpeg|png)$/i, '');
  const stripped = b.replace(/^room_/, '');
  const candidates = b === stripped ? [b] : [b, stripped];
  const pubDir = path.join(__dirname, 'public');
  for (const cand of candidates) {
    for (const ext of ['jpg','jpeg','png','JPG','JPEG','PNG']) {
      if (fs.existsSync(path.join(pubDir, folder, cand+'.'+ext))) return true;
      if (fs.existsSync(path.join(pubDir, cand+'.'+ext)))          return true;
    }
  }
  return false;
}

/** Sanitize a room/item description before inserting into an image prompt.
 *  Trims to first sentence (≤120 chars), then replaces words that commonly
 *  trigger OpenAI content-policy rejections with neutral fantasy equivalents. */
function wonderSanitizeContext(raw) {
  if (!raw) return '';
  // Take only the first sentence (up to first period or 120 chars)
  let s = raw.split(/\.\s/)[0].slice(0, 120);
  // Replace flagged words with art-safe equivalents
  const subs = [
    [/\b(corpse|corpses|body|bodies|cadaver)\b/gi, 'fallen warrior'],
    [/\b(dead|death|dying|slain)\b/gi,             'defeated'],
    [/\b(skull|skulls)\b/gi,                        'ancient helmet'],
    [/\b(blood|bloody|gore|gory)\b/gi,              'crimson stain'],
    [/\b(bone|bones|skeletal|skeleton)\b/gi,        'ancient stone'],
    [/\b(rot|rotting|decay|decaying|putrid)\b/gi,  'weathered'],
    [/\b(undead|zombie|zombies)\b/gi,               'cursed warrior'],
    [/\b(demon|demonic|fiend|fiendish)\b/gi,        'dark spirit'],
    [/\b(hell|hellish|infernal)\b/gi,               'shadowy realm'],
    [/\b(torture|torment)\b/gi,                     'ancient trial'],
    [/\b(murder|murdered|kill|killed|slaughter)\b/gi, 'ancient battle'],
    [/\b(drown|drowned|drowning|flooded|flood|sunken|submerge|submerged)\b/gi, 'waterlogged'],
    [/\b(plague|pestilence|disease)\b/gi,           'ancient curse'],
    [/\b(curse|cursed)\b/gi,                        'enchanted'],
    [/\b(grave|graves|graveyard|cemetery)\b/gi,     'ancient memorial'],
    [/\b(tomb|tombs)\b/gi,                          'ancient vault'],
    [/\b(crypt|crypts)\b/gi,                        'stone chamber'],
    [/\b(mausoleum)\b/gi,                           'stone hall'],
    [/\b(lich|liches)\b/gi,                         'ancient sorcerer'],
    [/\b(wraith|wraiths|specter|specters|shade|shades)\b/gi, 'shadow spirit'],
    [/\b(vampire|vampires)\b/gi,                    'shadowed noble'],
    [/\b(sacrifice|sacrificial|sacrificed)\b/gi,    'ancient ritual'],
    [/\b(ritual|rituals)\b/gi,                      'ancient ceremony'],
    [/\b(altar|altars)\b/gi,                        'stone platform'],
    [/\b(forsaken|damned|accursed)\b/gi,            'abandoned'],
    [/\b(void|abyss|abyssal)\b/gi,                  'shadowy depths'],
    [/\b(sinister|malevolent|malefic)\b/gi,         'mysterious'],
    [/\b(prior|monk|monks|friar)\b/gi,              'robed figure'],
    [/\b(cathedral|chapel|church|nave|chancel|transept|abbey|monastery)\b/gi, 'ancient stone hall'],
  ];
  for (const [pat, rep] of subs) s = s.replace(pat, rep);
  return s.trim();
}

/** Build a DALL-E prompt appropriate for the entity type */
function wonderBuildPrompt(type, name, context) {
  const style = 'fantasy RPG digital art, richly detailed, dark moody lighting, painterly style';
  const ctx = wonderSanitizeContext(context);
  const safeName = wonderSanitizeContext(name); // also clean the name itself
  switch (type) {
    case 'room':
      return `${style}. A detailed fantasy RPG environment scene: ${safeName}. ${ctx} Immersive interior or exterior setting. No text, no UI, no watermarks.`;
    case 'npc':
      return `${style}. Fantasy RPG character portrait — bust shot: ${safeName}. ${ctx} Highly detailed face and upper body. Dark background. No text, no UI.`;
    case 'monster':
      return `${style}. Fantasy RPG creature illustration: ${safeName}. ${ctx} Menacing, detailed, on a dark atmospheric background. No text, no UI.`;
    case 'item':
      return `${style}. Fantasy RPG item render: ${safeName}. ${ctx} Object centered on a dark background with subtle magical glow. No text, no UI.`;
    case 'tile':
      return `Fantasy RPG map location art. A richly illustrated scene for the map node "${safeName}". ${ctx} Wide establishing shot showing the exterior or key visual identity of this location. Atmospheric, detailed, suitable as a square map tile. No text, no UI, no watermarks.`;
    default:
      return `${style}. ${safeName}. ${ctx}`;
  }
}

/** Target pixel dimensions per image type — used by wonderResize() */
const WONDER_IMG_SIZES = {
  room:    { w:512, h:256 },
  tile:    { w:256, h:256 },
  monster: { w:256, h:256 },
  npc:     { w:256, h:256 },
  item:    { w:128, h:128 },
};

/** Resize a saved image file in-place using sharp */
async function wonderResize(filePath, type) {
  const dims = WONDER_IMG_SIZES[type];
  if (!dims) return; // unknown type — skip
  try {
    const tmp = filePath + '.tmp';
    await sharp(filePath).resize(dims.w, dims.h, { fit:'cover', position:'centre' }).jpeg({ quality:85 }).toFile(tmp);
    fs.renameSync(tmp, filePath);
  } catch (e) {
    console.log('[Wonder] Resize error:', e.message);
  }
}

/** Call one image API (OpenAI or Grok). Returns { ok, reason, statusCode } */
async function wonderCallImageAPI(apiKey, endpoint, model, promptText) {
  // gpt-image-1 does not accept response_format; grok-imagine-image supports url
  const isOpenAI = endpoint.includes('openai.com');
  const body = isOpenAI
    ? { model, prompt:promptText, n:1, size:'1024x1024', quality:'medium' }
    : { model, prompt:promptText, n:1 };
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      let errTxt = await res.text().catch(()=>'');
      try { const j = JSON.parse(errTxt); errTxt = j?.error?.message || errTxt; } catch(_) {}
      return { ok:false, reason:`HTTP ${res.status}: ${errTxt.slice(0,200)}`, statusCode:res.status };
    }
    const json = await res.json();
    const b64  = json?.data?.[0]?.b64_json;
    const url  = json?.data?.[0]?.url;
    let buf;
    if (b64) {
      buf = Buffer.from(b64, 'base64');
    } else if (url) {
      const dl = await fetch(url);
      if (!dl.ok) return { ok:false, reason:`Download HTTP ${dl.status}`, statusCode:dl.status };
      buf = Buffer.from(await dl.arrayBuffer());
    } else {
      return { ok:false, reason:`No image data: ${JSON.stringify(json).slice(0,120)}`, statusCode:0 };
    }
    return { ok:true, buf };
  } catch (e) {
    return { ok:false, reason:e.message, statusCode:0 };
  }
}

/** Generate an image: try OpenAI first; if it returns a content-policy rejection (HTTP 400/400)
 *  automatically fall back to Grok (xAI). Saves and resizes the result.
 *  Returns { ok:true, api } on success, or { ok:false, reason } on failure. */
async function wonderGenerate(promptText, folder, filename, type) {
  const destDir  = path.join(__dirname, 'public', folder);
  const destFile = path.join(destDir, filename + '.jpg');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive:true });

  // ── 1. Try OpenAI ─────────────────────────────────────────────────────────
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const r = await wonderCallImageAPI(openaiKey, 'https://api.openai.com/v1/images/generations', 'gpt-image-1', promptText);
    if (r.ok) {
      fs.writeFileSync(destFile, r.buf);
      await wonderResize(destFile, type);
      _WND.stats.generated++;
      console.log(`[Wonder] ✓ OpenAI → ${folder}/${filename}.jpg`);
      return { ok:true, api:'openai' };
    }
    // Only fall through to Grok on content-policy (400) or billing (402/429) — not on auth errors
    const fatal = r.statusCode === 401 || r.statusCode === 403;
    console.log(`[Wonder] OpenAI failed (${r.statusCode}): ${r.reason}`);
    if (fatal) return { ok:false, reason:`OpenAI: ${r.reason}` };
    // 400 = content policy → try Grok
  }

  // ── 2. Fall back to Grok (xAI) ────────────────────────────────────────────
  const grokKey = process.env.XAI_API_KEY;
  if (grokKey) {
    const r = await wonderCallImageAPI(grokKey, 'https://api.x.ai/v1/images/generations', 'grok-imagine-image', promptText);
    if (r.ok) {
      fs.writeFileSync(destFile, r.buf);
      await wonderResize(destFile, type);
      _WND.stats.generated++;
      console.log(`[Wonder] ✓ Grok → ${folder}/${filename}.jpg`);
      return { ok:true, api:'grok' };
    }
    console.log(`[Wonder] Grok failed (${r.statusCode}): ${r.reason}`);
    return { ok:false, reason:`OpenAI+Grok both failed — Grok: ${r.reason}` };
  }

  if (!openaiKey && !grokKey) return { ok:false, reason:'No API key configured (OPENAI_API_KEY or XAI_API_KEY)' };
  return { ok:false, reason:'All configured APIs rejected the request' };
}

/** Scan one room — queue any missing images and log any broken exit links */
function wonderScanRoom(roomId) {
  const rm = world[roomId];
  if (!rm) return;
  _WND.stats.roomsScanned++;
  // Helper: only push if not already queued for this file
  const enqueue = (task) => {
    const alreadyQueued = _WND.queue.some(t => t.folder === task.folder && t.filename === task.filename);
    if (!alreadyQueued) _WND.queue.push(task);
  };

  // 1. Room image (from ROOM_PROFILES)
  // If no profile entry or no img key, Wonder claims a filename automatically
  if (!ROOM_PROFILES[roomId] || !ROOM_PROFILES[roomId].img) {
    const autoFilename = roomId.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!ROOM_PROFILES[roomId]) ROOM_PROFILES[roomId] = {};
    ROOM_PROFILES[roomId].img = autoFilename;
    // Persist so the banner assignment survives server restart
    saveAdminOverrides('rooms', roomId, { img: autoFilename });
  }
  const rp = ROOM_PROFILES[roomId];
  if (rp && rp.img) {
    if (!wonderImgExists('rooms', rp.img)) {
      const prompt = wonderBuildPrompt('room', rm.name, rm.desc||'');
      enqueue({ type:'room', name:rm.name, folder:'rooms', filename:rp.img.replace(/^room_/,''), prompt, roomId });
    }
  }

  // 2. NPC portraits in this room (skip Wonder herself)
  Object.values(NPCS).filter(n => n.room === roomId && n.portrait !== 'wonder').forEach(npc => {
    if (npc.portraitFile && !wonderImgExists('npcs', npc.portraitFile)) {
      const base = npc.portraitFile.replace(/\.(jpg|jpeg|png)$/i, '');
      const prompt = wonderBuildPrompt('npc', npc.name, npc.desc||'');
      enqueue({ type:'npc', name:npc.name, folder:'npcs', filename:base, prompt, roomId });
    }
  });

  // 3. Monster portraits (from the world template WT)
  const tmpl = WT[roomId];
  (tmpl?.mon || []).forEach(mob => {
    const mobName = (typeof mob === 'string') ? mob : mob.name;
    const portraitKey = MOB_PORTRAITS[mobName];
    if (portraitKey && !wonderImgExists('monsters', portraitKey)) {
      const prompt = wonderBuildPrompt('monster', mobName);
      const monBase = portraitKey.replace(/\.(jpg|jpeg|png)$/i, '');
      enqueue({ type:'monster', name:mobName, folder:'monsters', filename:monBase, prompt, roomId });
    }
  });

  // 4. Base item images (ITEM_PROFILES)
  (tmpl?.base || []).forEach(itemName => {
    const ip = ITEM_PROFILES[itemName.toLowerCase()];
    if (ip && ip.img && !wonderImgExists('items', ip.img)) {
      const prompt = wonderBuildPrompt('item', itemName, ip.desc||'');
      enqueue({ type:'item', name:itemName, folder:'items', filename:ip.img, prompt, roomId });
    }
  });

  // 5. Shop item images — check every item sold here against ITEM_PROFILES
  if (rm.shop && SHOPS[rm.shop]) {
    SHOPS[rm.shop].items.forEach(item => {
      const ip = ITEM_PROFILES[item.name.toLowerCase()];
      if (ip && ip.img && !wonderImgExists('items', ip.img)) {
        const prompt = wonderBuildPrompt('item', item.name, ip.desc || '');
        enqueue({ type:'item', name:item.name, folder:'items', filename:ip.img, prompt, roomId });
      }
    });
  }

  // 6. Broken exit links
  Object.entries(rm.exits || {}).forEach(([dir, dest]) => {
    if (!world[dest]) {
      _WND.stats.brokenLinks++;
      const msg = `⚠ Broken exit: "${rm.name}" [${roomId}] → ${dir} → unknown room "${dest}"`;
      console.log('[Wonder]', msg);
      wonderPush(msg, 'err');
    }
  });

  // 7. Map tile (public/Tiles/) — client looks up nameToTile(rm.name), then roomId
  const tileByName = serverNameToTile(rm.name);   // e.g. "the_broken_flagon"
  const tileByRoom = roomId;                        // e.g. "tavern"
  const tileByProp = rm.tileImg || null;            // explicit override if set on room
  const tileExists = (tileByProp && wonderImgExists('Tiles', tileByProp))
                  || wonderImgExists('Tiles', tileByName)
                  || wonderImgExists('Tiles', tileByRoom);
  if (!tileExists) {
    // Save under the name the client will find first
    const tileSaveName = tileByProp || tileByName;
    const prompt = wonderBuildPrompt('tile', rm.name, rm.desc||'');
    enqueue({ type:'tile', name:rm.name, folder:'Tiles', filename:tileSaveName, prompt, roomId });
  }
}

/** Dequeue and process one image generation task (respects rate limit) */
async function wonderProcessQueue() {
  if (_WND.busy || _WND.paused) return;
  const task = _WND.queue.shift();
  if (!task) return;

  _WND.busy = true;

  // Enforce rate limit
  const elapsed = Date.now() - _WND.lastGenTime;
  if (elapsed < _WND.GEN_DELAY) {
    await new Promise(r => setTimeout(r, _WND.GEN_DELAY - elapsed));
  }

  // Teleport Wonder to the room that needs work so players see her there
  if (task.roomId && world[task.roomId] && task.roomId !== _WND.room) {
    _WND.room = task.roomId;
    NPCS.wonder.room = task.roomId;
    sendRoomOccupants(task.roomId); // update room occupant lists for players in that room
  }

  // Announce in Wonder's current room + push to admin panels
  sayRoom(_WND.room, `✦ Wonder: Generating image for ${task.type} "${task.name}"…`, 'sys');
  wonderPush(`Generating [${task.type}] "${task.name}" → ${task.folder}/${task.filename}.jpg`, 'sys');

  _WND.lastGenTime = Date.now();
  const result = await wonderGenerate(task.prompt, task.folder, task.filename, task.type);

  if (result.ok) {
    const apiTag = result.api === 'grok' ? ' [via Grok]' : '';
    sayRoom(_WND.room, `✦ Wonder: ✓ Image created for ${task.type} "${task.name}".`, 'ok');
    wonderPush(`✓ Saved ${task.type} image: "${task.name}" → ${task.folder}/${task.filename}.jpg${apiTag}`, 'ok');
  } else {
    _WND.stats.skipped++;
    task.retries = (task.retries || 0) + 1;
    const MAX_RETRIES = 3;
    const errMsg = result.reason || 'Unknown error';
    console.log(`[Wonder] ✗ "${task.name}" attempt ${task.retries}/${MAX_RETRIES}: ${errMsg}`);
    if (task.retries < MAX_RETRIES) {
      // Re-queue with a delay before next attempt
      const delayMs = task.retries * 30000; // 30s, 60s, 90s back-off
      sayRoom(_WND.room, `✦ Wonder: Image failed for "${task.name}" (attempt ${task.retries}/${MAX_RETRIES}) — retrying in ${task.retries*30}s.`, 'err');
      wonderPush(`✗ Generation failed for "${task.name}" [attempt ${task.retries}/${MAX_RETRIES}]: ${errMsg}`, 'err');
      setTimeout(() => _WND.queue.push(task), delayMs);
    } else {
      // Give up after MAX_RETRIES
      sayRoom(_WND.room, `✦ Wonder: Gave up on image for "${task.name}" after ${MAX_RETRIES} attempts.`, 'err');
      wonderPush(`✗ DROPPED "${task.name}" after ${MAX_RETRIES} failures: ${errMsg}`, 'err');
    }
  }

  _WND.busy = false;
  // Continue draining the queue
  if (_WND.queue.length && !_WND.paused) {
    setTimeout(wonderProcessQueue, 200);
  } else if (!_WND.queue.length && _WND.fullScanDone && !_WND.ideaMode && !_WND.paused) {
    // All images done after a full world scan — enter creative idea mode
    _WND.ideaMode = true;
    wonderPush('✦ All content generated — Wonder enters creative mode and will design new areas.','ok');
    scheduleIdeaGeneration();
  }
}

/** Called every 45 seconds — move Wonder to the next room and scan it */
function wonderTick() {
  if (_WND.paused) return;
  if (!_WND.roomList.length) return; // not initialised yet

  // Advance to next room in patrol route
  const roomId = _WND.roomList[_WND.roomIdx];
  _WND.roomIdx = (_WND.roomIdx + 1) % _WND.roomList.length;

  // Move the NPC to the new room
  _WND.room = roomId;
  NPCS.wonder.room = roomId;

  // Scan for missing images and broken links
  const qBefore = _WND.queue.length;
  wonderScanRoom(roomId);
  const added = _WND.queue.length - qBefore;

  // Push location/queue update to any open admin panels
  wonderPush(`Patrolling: ${world[roomId]?.name||roomId}${added?' — '+added+' task(s) queued':''}`, 'sys');

  // Start processing the queue if tasks were found and not already running
  if (_WND.queue.length && !_WND.busy) wonderProcessQueue();
}

// ── Wonder Creative Mode ───────────────────────────────────────────────────

/** Schedule the next idea generation (2 hours apart while in idea mode) */
function scheduleIdeaGeneration() {
  if (_WND._ideaTimer) clearTimeout(_WND._ideaTimer);
  // Generate one immediately if we haven't made a recent idea
  const recent = _WND.ideas.find(i => Date.now() - i.createdAt < 60*60*1000);
  if (!recent) setTimeout(wonderGenerateIdea, 6000);
  // Then schedule repeat every 2 hours
  _WND._ideaTimer = setInterval(() => {
    if (_WND.ideaMode && !_WND.busy && !_WND.queue.length) wonderGenerateIdea();
  }, 2*60*60*1000);
}

/** Ask Claude to design a new 20–50-room adventure area */
/** Collect all unique monsters currently in the world, with their stats */
function wonderCollectExistingMonsters() {
  const seen = {};
  Object.values(WT).forEach(t => {
    (t.mon||[]).forEach(m => {
      if (m.name && !seen[m.name]) seen[m.name] = { name:m.name, hp:m.hp, atk:m.atk, def:m.def, xp:m.xp };
    });
  });
  // Also scan world room inline monsters
  Object.values(world).forEach(rm => {
    (rm.mon||[]).forEach(m => {
      if (m.name && !seen[m.name]) seen[m.name] = { name:m.name, hp:m.hp||40, atk:m.atk||8, def:m.def||4, xp:m.xp||20 };
    });
  });
  return Object.values(seen);
}

/** Find a monster's stats from any existing WT room, or return defaults */
function wonderFindMonsterStats(name) {
  for (const t of Object.values(WT)) {
    const found = (t.mon||[]).find(m => m.name === name);
    if (found) return found;
  }
  // Try world inline monsters
  for (const rm of Object.values(world)) {
    const found = (rm.mon||[]).find(m => m.name === name);
    if (found) return found;
  }
  return null;
}

async function wonderGenerateIdea() {
  if (_WND.paused) return;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.log('[Wonder] No ANTHROPIC_API_KEY — cannot generate ideas'); return; }
  wonderPush('✦ Wonder is dreaming up a new adventure area…','sys');
  console.log('[Wonder] Generating area idea via Claude…');

  const existingZones = [...new Set(Object.values(world).map(r=>r.zone).filter(Boolean))].slice(0,25).join(', ');
  const existingCount = Object.keys(world).length;

  // Build a catalogue of existing monsters for Wonder to reference
  const existingMobs = wonderCollectExistingMonsters().slice(0, 40);
  const mobCatalogue = existingMobs.length
    ? existingMobs.map(m => `"${m.name}" (hp:${m.hp} atk:${m.atk} def:${m.def} xp:${m.xp})`).join('\n  ')
    : '(none yet — create all new)';

  // Build a catalogue of existing equippable items
  const existingItems = Object.entries(EQ)
    .filter(([,v]) => ['weapon','armor','trinket'].includes(v.t))
    .slice(0, 35)
    .map(([k,v]) => `"${k}" (${v.t} atk:${v.atk} def:${v.def})`);
  const itemCatalogue = existingItems.length
    ? existingItems.join('\n  ')
    : '(none yet — create all new)';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({
        model:'claude-opus-4-5', max_tokens:8192,
        system:`You are a creative dungeon designer for "Adams World," a dark fantasy MUD. The world has ${existingCount} rooms across zones: ${existingZones}. Design a NEW, original adventure area. Return ONLY valid JSON — no explanation, no markdown, no text outside the JSON object.`,
        messages:[{role:'user',content:`Design a new adventure area for Adams World MUD.

Requirements:
- Between 20 and 50 rooms total
- A brand-new zone name NOT in this list: ${existingZones}
- The FIRST room in the "rooms" array is the entrance
- All room IDs must be snake_case and globally unique (prefix every ID with your zone name, e.g. "cryptwood_")
- Room exits must ONLY reference other rooms within this area (north/south/east/west)
- The area must be fully connected (every room reachable from the entrance)

MONSTER RULES — read carefully:
The world already has these monsters (you may REUSE any of them by name):
  ${mobCatalogue}

- Use existing_monsters for monsters already in the game (reference by exact name)
- Use new_monsters for creatures unique to this area (include portrait_desc for image generation)
- Aim for 60-70% reuse of existing monsters where thematically fitting
- new_monsters get AI-generated portrait art, so make them visually interesting

ITEM RULES — read carefully:
The world already has these equippable items (you may assign them as monster drops):
  ${itemCatalogue}

Design 3-8 new items unique to this area. Items can be:
- Weapons / armor / trinkets (equippable, with atk/def stats)
- Potions or consumables (t:"potion", heal amount)
- Area curiosities (t:"misc", no stats — collectible lore items)

Items can drop from monsters (drops_from), be sold by a vendor NPC (sold_at room ID), or both.
If an existing item makes thematic sense as a monster drop, list it in existing_item_drops.
All new items get AI-generated portrait art — write a vivid portrait_desc.

Return this exact JSON structure:
{
  "title": "Display name of the area",
  "concept": "One sentence pitch",
  "zone": "ZoneName",
  "lore": "2-3 sentence backstory paragraph",
  "rooms": [
    {"id":"zone_entrance","name":"Display Name","desc":"2-3 sentence description.","zone":"ZoneName","exits":{"north":"zone_hall"}}
  ],
  "new_monsters": [
    {"name":"Unique Monster Name","xp":50,"hp":80,"atk":12,"def":6,"gold":20,"portrait_desc":"A hulking creature with obsidian scales and burning red eyes","room_ids":["zone_entrance","zone_hall"]}
  ],
  "existing_monsters": [
    {"name":"Exact Existing Monster Name","room_ids":["zone_corridor","zone_pit"]}
  ],
  "new_items": [
    {
      "name":"Area Unique Item Name",
      "type":"weapon",
      "atk":14,"def":1,"cost":180,
      "desc":"One sentence flavor text for the item.",
      "portrait_desc":"A curved blade etched with glowing runes, dark fantasy art, item centered on dark background",
      "drops_from":["Unique Monster Name"],
      "sold_at":"zone_merchant_room"
    }
  ],
  "existing_item_drops": [
    {"name":"exact existing item name","drops_from":["Monster Name That Drops It"]}
  ],
  "npcs": [
    {"name":"NPC Name","title":"Their Title","roomId":"zone_entrance","desc":"Brief description.","ai":true}
  ]
}`}]
      })
    });
    if (!res.ok) { console.log(`[Wonder] Idea API error ${res.status}`); return; }
    const j = await res.json();
    const text = (j?.content?.[0]?.text||'').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) { console.log('[Wonder] No JSON in idea response'); return; }
    const idea = JSON.parse(match[0]);
    if (!Array.isArray(idea.rooms) || idea.rooms.length < 5) {
      console.log('[Wonder] Idea had too few rooms:', idea.rooms?.length); return;
    }
    // Normalise legacy 'monsters' field (fallback if model uses old schema)
    if (!idea.new_monsters && Array.isArray(idea.monsters)) {
      idea.new_monsters = idea.monsters;
    }
    idea.new_monsters        = idea.new_monsters        || [];
    idea.existing_monsters   = idea.existing_monsters   || [];
    idea.new_items           = idea.new_items           || [];
    idea.existing_item_drops = idea.existing_item_drops || [];
    idea.id = `idea_${Date.now()}`;
    idea.status = 'pending';
    idea.createdAt = Date.now();
    _WND.ideas.unshift(idea);
    if (_WND.ideas.length > 30) _WND.ideas.pop();
    const newMobCount  = idea.new_monsters.length;
    const reuseMobCount = idea.existing_monsters.length;
    const newItemCount  = idea.new_items.length;
    console.log(`[Wonder] New idea: "${idea.title}" — ${idea.rooms.length} rooms, ${newMobCount} new monsters, ${reuseMobCount} reused, ${newItemCount} new items`);
    wonderPush(
      `✦ Wonder proposes: "${idea.title}" (${idea.rooms.length} rooms · ${newMobCount} new + ${reuseMobCount} reused monsters · ${newItemCount} new items) — awaiting approval.`,
      'ok', {ideas:_WND.ideas.slice(0,10).map(ideaSummary)}
    );
  } catch(e) {
    console.log('[Wonder] Idea error:', e.message);
  }
}

function ideaSummary(i) {
  return {
    id:           i.id,
    title:        i.title,
    concept:      i.concept,
    zone:         i.zone,
    roomCount:    (i.rooms||[]).length,
    newMobCount:  (i.new_monsters||i.monsters||[]).length,
    reuseMobCount:(i.existing_monsters||[]).length,
    newItemCount:  (i.new_items||[]).length,
    status:       i.status,
    createdAt:    i.createdAt
  };
}

/** Place an approved idea's rooms into the live world */
function wonderBuildArea(idea) {
  const OPPOSITE = {north:'south',south:'north',east:'west',west:'east'};
  const entranceRoom = idea.rooms[0];
  if (!entranceRoom) { wonderPush(`✗ Idea "${idea.title}" has no rooms.`,'err'); return; }

  // 1. Register all rooms
  idea.rooms.forEach(rm => {
    world[rm.id] = {
      name: rm.name,
      desc: rm.desc || `A location in ${idea.title}.`,
      zone: rm.zone || idea.zone,
      exits: Object.assign({}, rm.exits || {}),
      monsters: [],
      _dynamic: true
    };
    if (!WT[rm.id]) WT[rm.id] = {mon:[], base:[]};
  });

  // 2a. Add NEW monsters (unique to this area — queue portrait generation)
  const _newMobsSeen = new Set();
  (idea.new_monsters||idea.monsters||[]).forEach(mob => {
    if (!mob.name) return;
    const _mobXp = mob.xp || 40;
    (mob.room_ids||[]).forEach(rid => {
      if (world[rid] && WT[rid]) {
        WT[rid].mon.push({
          name: mob.name,
          hp:   mob.hp  || 60,
          atk:  mob.atk || 12,
          def:  mob.def || 5,
          xp:   _mobXp,
          gold: mob.gold || Math.max(5, Math.floor(_mobXp * 0.4)),
        });
      }
    });
    // Queue portrait generation for each unique new monster
    if (!_newMobsSeen.has(mob.name)) {
      _newMobsSeen.add(mob.name);
      const portraitKey = mob.name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
      if (!MOB_PORTRAITS[mob.name]) {
        MOB_PORTRAITS[mob.name] = portraitKey + '.jpg';
        const prompt = mob.portrait_desc
          ? `Fantasy RPG monster portrait: ${mob.portrait_desc}. Dark fantasy art style, dramatic lighting, detailed.`
          : `Fantasy RPG monster portrait of ${mob.name}. Dark fantasy art style, dramatic lighting, full creature visible.`;
        _WND.queue.push({ type:'monster', name:mob.name, folder:'monsters', filename:portraitKey, prompt, roomId:(mob.room_ids||[])[0]||'' });
        console.log(`[Wonder] Queued portrait for new monster: ${mob.name}`);
      }
    }
  });

  // 2b. Add EXISTING monsters (reuse stats from any WT room; just populate new rooms)
  (idea.existing_monsters||[]).forEach(mob => {
    if (!mob.name) return;
    const stats = wonderFindMonsterStats(mob.name);
    if (!stats) {
      console.log(`[Wonder] WARNING: existing monster "${mob.name}" not found in WT — skipping`);
      return;
    }
    (mob.room_ids||[]).forEach(rid => {
      if (world[rid] && WT[rid]) {
        WT[rid].mon.push({
          name: stats.name,
          hp:   stats.hp  || 50,
          atk:  stats.atk || 10,
          def:  stats.def || 4,
          xp:   stats.xp  || 30,
          gold: stats.gold || Math.max(5, Math.floor((stats.xp||30)*0.4)),
          loot: stats.loot || undefined,
        });
      }
    });
  });

  // ── Helper: assign loot to any monster by name across this area's WT rooms ─
  const _assignAreaLoot = (monName, itemName) => {
    idea.rooms.forEach(rm => {
      const wt = WT[rm.id]; if (!wt) return;
      wt.mon.forEach(mob => { if (mob.name === monName && !mob.loot) mob.loot = itemName; });
    });
  };

  // 3. Register area-specific items ──────────────────────────────────────────
  const _areaShopKey = `wonder_shop_${(idea.zone||idea.title).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')}`;
  let _areaShopCreated = false;

  (idea.new_items||[]).forEach(item => {
    if (!item.name) return;
    const key  = item.name.toLowerCase();
    const slug = key.replace(/'/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');

    // Register in EQ (equip system)
    if (!EQ[key]) {
      EQ[key] = {
        t:    item.type || 'misc',
        atk:  item.atk  || 0,
        def:  item.def  || 0,
        desc: item.desc || '',
        _dynamic: true
      };
    }

    // Register in ITEM_PROFILES (image / description)
    if (!ITEM_PROFILES[key]) {
      ITEM_PROFILES[key] = { img: slug, desc: item.desc || '', _dynamic: true };
    }

    // Queue portrait generation for this item
    const imgPrompt = item.portrait_desc
      ? `Fantasy RPG item icon: ${item.portrait_desc}. Dark fantasy art style, item centered on dark background, detailed.`
      : `Fantasy RPG item icon of ${item.name}. Dark fantasy art style, detailed, dark background.`;
    _WND.queue.push({ type:'item', name:item.name, folder:'items', filename:slug, prompt:imgPrompt, roomId:'' });
    console.log(`[Wonder] Queued portrait for new item: ${item.name}`);

    // Assign as monster loot drop
    (item.drops_from||[]).forEach(monName => _assignAreaLoot(monName, item.name));

    // Add to area vendor shop if sold_at is given
    if (item.sold_at) {
      const soldRoom = world[item.sold_at];
      if (soldRoom) {
        if (!_areaShopCreated) {
          SHOPS[_areaShopKey] = { name:`${idea.title} Trader`, greet:`Local goods from ${idea.title}.`, items:[], _dynamic:true };
          soldRoom.shop = _areaShopKey;
          _areaShopCreated = true;
        }
        SHOPS[_areaShopKey].items.push({
          name: item.name, cost: item.cost || 50,
          t:    item.type || 'misc',
          atk:  item.atk  || 0,
          def:  item.def  || 0,
        });
      }
    }
  });

  // Assign existing items as drops where Wonder specified
  (idea.existing_item_drops||[]).forEach(drop => {
    if (!drop.name || !drop.drops_from) return;
    drop.drops_from.forEach(monName => _assignAreaLoot(monName, drop.name));
  });

  const _newItemCount = (idea.new_items||[]).length;
  const _reuseDropCount = (idea.existing_item_drops||[]).length;
  console.log(`[Wonder] Items — ${_newItemCount} new (${_areaShopCreated?'shop created':'no shop'}), ${_reuseDropCount} existing reused as drops`);

  // 4. Add NPCs (mark _dynamic for persistence)
  (idea.npcs||[]).forEach(npc => {
    const key = (npc.name||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')+'_w'+idea.id.slice(-4);
    NPCS[key] = {
      name:npc.name, title:npc.title||'', room:npc.roomId||entranceRoom.id,
      desc:npc.desc||'', ai:true, portrait:key, portraitFile:key+'.jpg',
      greeting:`Welcome to ${idea.title}.`, _dynamic:true
    };
  });

  // 4. Connect entrance to an existing room via a free direction
  // Prefer dead-end rooms (single exit) so Wonder areas feel like deliberate discoveries
  const ALL_DIRS = ['north','south','east','west','up','down'];
  // Ordered list of good expansion anchor rooms — dead ends or rooms with typically free directions
  const preferredAnchors = [
    'copper_mine','quarry_outlook','silver_lode','frozen_docks','swamp_heart',
    'ravine_crevasse','barrow_depths','bog_cave','dragon_lair','volcanic_secret',
    'cinder_tomb','heaven_gate','the_breaking_point','abyssal_vault','throne_of_falls',
    'abyssal_shrine','bastion_keep','tower_of_ruin','guild_outpost','guild_hall_row',
    'mountain_lookout','glacier_cave','frozen_docks','storm_ridge','ashford_outskirts',
    'farmstead_cellar','bandit_captain_den','ravine_grotto','forest_ruins',
    'boss_chamber','void_temple','astral_sea','void_sanctum',
  ];
  let hubRoom=null, connectDir=null;
  // Pass 1: check preferred anchors
  for (const cand of preferredAnchors) {
    if (!world[cand] || world[cand]._dynamic) continue;
    const taken = new Set(Object.keys(world[cand].exits||{}));
    for (const dir of ALL_DIRS) {
      if (!taken.has(dir)) { hubRoom=cand; connectDir=dir; break; }
    }
    if (hubRoom) break;
  }
  if (!hubRoom) {
    // Pass 2: scan all static rooms for any free direction (prefer single-exit dead ends)
    const deadEnds = [], others = [];
    for (const [id,rm] of Object.entries(world)) {
      if (rm._dynamic) continue;
      const exitCount = Object.keys(rm.exits||{}).length;
      (exitCount <= 2 ? deadEnds : others).push([id,rm]);
    }
    for (const [id,rm] of [...deadEnds,...others]) {
      const taken = new Set(Object.keys(rm.exits||{}));
      for (const dir of ALL_DIRS) {
        if (!taken.has(dir)) { hubRoom=id; connectDir=dir; break; }
      }
      if (hubRoom) break;
    }
  }
  if (hubRoom && connectDir) {
    world[hubRoom].exits[connectDir] = entranceRoom.id;
    world[entranceRoom.id].exits[OPPOSITE[connectDir]] = hubRoom;
    // Persist the connector so it survives server restarts (loadDynamic re-applies it)
    if (!world[hubRoom]._dynamic) {
      if (!_WND._connectors) _WND._connectors = [];
      _WND._connectors.push({ staticRoom: hubRoom, dir: connectDir, dest: entranceRoom.id });
    }
    console.log(`[Wonder] Connected "${idea.title}" via ${world[hubRoom].name} → ${connectDir}`);
  } else {
    console.log('[Wonder] WARNING: no free hub direction found — area is disconnected');
  }

  // 5. Refresh patrol list
  _WND.roomList = Object.keys(world).filter(id => id !== 'wonder_limbo');

  // 6. Persist everything
  saveDynamic();
  idea.status = 'done';
  const hubName = world[hubRoom]?.name || hubRoom || 'an existing room';
  const _newMobNames  = [..._newMobsSeen].join(', ') || 'none';
  const _reusedCount  = (idea.existing_monsters||[]).length;
  const _itemSummary  = _newItemCount ? `${_newItemCount} new items${_areaShopCreated?' (+ trader shop)':''}` : 'no new items';
  wonderPush(
    `✦ Wonder built "${idea.title}" — ${idea.rooms.length} rooms live! Entrance via ${hubName}. ` +
    `Monsters: ${_newMobsSeen.size} new + ${_reusedCount} reused. Items: ${_itemSummary}.`,
    'ok', {ideas:_WND.ideas.slice(0,10).map(ideaSummary)}
  );
  console.log(`[Wonder] Built "${idea.title}" — ${idea.rooms.length} rooms. Hub: ${hubRoom} → ${connectDir}. Monsters: ${_newMobNames}. Items: ${_newItemCount} new, ${_reuseDropCount} drops assigned.`);

  // 7. Queue image generation for new rooms
  setTimeout(()=>{
    idea.rooms.forEach(rm => wonderScanRoom(rm.id));
    if (_WND.queue.length && !_WND.busy && !_WND.paused) wonderProcessQueue();
  }, 2000);
}

/** Build a structured status object for the client Wonder panel */
function wonderStatusData() {
  return {
    type: 'wonder_status',
    paused: _WND.paused,
    busy: _WND.busy,
    room: _WND.room,
    roomName: world[_WND.room]?.name || _WND.room,
    roomIdx: _WND.roomIdx,
    roomCount: _WND.roomList.length,
    queueLen: _WND.queue.length,
    stats: {..._WND.stats},
    nextTasks: _WND.queue.slice(0, 8).map(t => ({type:t.type, name:t.name, folder:t.folder, filename:t.filename})),
    ideaMode: _WND.ideaMode,
    ideas: _WND.ideas.slice(0, 10).map(ideaSummary)
  };
}

/** Send a live Wonder update event to all online admins */
function wonderPush(message, cls='sys', extraFields={}) {
  const payload = {
    type: 'wonder_update',
    message,
    cls,
    paused: _WND.paused,
    busy: _WND.busy,
    room: _WND.room,
    roomName: world[_WND.room]?.name || _WND.room,
    roomIdx: _WND.roomIdx,
    roomCount: _WND.roomList.length,
    queueLen: _WND.queue.length,
    stats: {..._WND.stats},
    nextTasks: _WND.queue.slice(0, 8).map(t => ({type:t.type, name:t.name, folder:t.folder, filename:t.filename})),
    ...extraFields
  };
  [...sessions.values()].filter(s => s.loggedIn && s.isAdmin).forEach(s => raw(s.ws, payload));
}

/** Print Wonder's status to an admin WebSocket (text fallback + structured data) */
function wonderStatus(ws) {
  raw(ws, wonderStatusData());
}

// Start Wonder's patrol after a 30-second warm-up (world must be fully loaded)
setTimeout(() => {
  loadDynamic(true); // NPCS is now defined — load dynamic NPCs from saved world
  _WND.roomList = Object.keys(world).filter(id => id !== 'wonder_limbo');
  _WND.roomIdx = 0;
  setInterval(wonderTick, 45*1000);
  console.log('[Wonder] World Keeper active — patrolling', _WND.roomList.length, 'rooms every 45 s');
}, 30*1000);


// ── Shrine / teleport ─────────────────────────────────────────────────────
function showShrine(ws,p){
  const isAshford = world[p.room]?.teleport==='ashford';
  if(isAshford){
    say(ws,'');say(ws,"✦ ══════ THE WAYFARER'S SHRINE ══════ ✦",'skill');
    say(ws,'The Wayfarer: "Beyond the frontier lie places that will test you to your limit."','narrate');
    for(const[k,z]of Object.entries(TELEPORT_ZONES_2)){
      const locked=p.level<z.lvl;
      if(locked) say(ws,`  [${k}] ${z.name.padEnd(24)} Lv${z.lvl}+  [LOCKED]`,'err');
      else say(ws,`  [${k}] ${z.name.padEnd(24)} Lv${z.lvl}+  Boss: ${z.boss}  — ${z.threat}`,'ok');
    }
    say(ws,`  Your Level: ${p.level}  |  TELEPORT [A-F] to travel  |  TELEPORT HOME to return`,'sys');
    const vc2=(p.zonesVisited2||[]).length;if(vc2>0)say(ws,`  Frontier zones explored: ${vc2}/6`,'sys');
  } else {
    say(ws,'');say(ws,'✦ ══════ THE ADVENTURE SHRINE ══════ ✦','skill');
    say(ws,'The Keeper: "Choose your destination, brave soul."','narrate');
    for(const[k,z]of Object.entries(TELEPORT_ZONES)){
      const locked=p.level<z.lvl;
      if(locked) say(ws,`  [${k}] ${z.name.padEnd(24)} Lv${z.lvl}+  [LOCKED]`,'err');
      else say(ws,`  [${k}] ${z.name.padEnd(24)} Lv${z.lvl}+  Boss: ${z.boss}  — ${z.threat}`,'ok');
    }
    say(ws,`  Your Level: ${p.level}  |  TELEPORT [1-8] to travel  |  TELEPORT HOME to return`,'sys');
    const vc=(p.zonesVisited||[]).length;if(vc>0)say(ws,`  Zones visited: ${vc}/8`,'sys');
  }
}

function doTeleport(ws,p,arg){
  if(p.inCombat)return say(ws,'Cannot teleport in combat!','err');
  // HOME returns to last shrine town
  if(arg==='home'||arg==='town'){
    const home=p.lastShrine||'town_square';
    if(_pt&&_pt.seats.find(s=>s.username===p.username))_ptLeave(ws,p,'You teleport away — your chips have been cashed out.');
    p.room=home;
    say(ws,'Reality bends. You step back through the standing stones.','narrate');
    describeRoom(ws,p);sidebar(ws,p);return;
  }
  const teleportType = world[p.room]?.teleport;
  if(!teleportType)return say(ws,'You must be at an Adventure Shrine to teleport.','err');
  const isAshford = teleportType==='ashford';
  const zones = isAshford ? TELEPORT_ZONES_2 : TELEPORT_ZONES;
  const z=zones[arg.toUpperCase()]||zones[arg];
  if(!z)return say(ws,`Unknown zone. Type SHRINE to see options.`,'err');
  if(p.level<z.lvl)return say(ws,`Need Level ${z.lvl} for ${z.name}. You are Level ${p.level}.`,'err');
  if(_pt&&_pt.seats.find(s=>s.username===p.username))_ptLeave(ws,p,'You teleport away — your chips have been cashed out.');
  p.lastShrine = isAshford ? 'ashford_square' : 'town_square';
  p.room=z.dest;
  if(isAshford){
    if(!p.zonesVisited2)p.zonesVisited2=[];
    if(!p.zonesVisited2.includes(z.dest))p.zonesVisited2.push(z.dest);
  } else {
    if(!p.zonesVisited)p.zonesVisited=[];
    if(!p.zonesVisited.includes(z.dest))p.zonesVisited.push(z.dest);
  }
  say(ws,'The standing stones blaze with light. Reality tears. You step through...','narrate');
  say(ws,`You arrive at ${z.name}!`,'ok');
  bAll({type:'line',text:`${p.name} teleports to ${z.name}!`,cls:'narrate'});
  if(!isAshford){
    const orig4=['volcanic_peak','frozen_tundra','sky_realm','shadow_realm'];
    const all8=[...orig4,'crystal_caverns','haunted_keep','astral_sea','void_sanctum'];
    if(orig4.every(d=>(p.zonesVisited||[]).includes(d)))checkAch(ws,p,'explorer');
    if(all8.every(d=>(p.zonesVisited||[]).includes(d)))checkAch(ws,p,'deep_explorer');
  }
  describeRoom(ws,p);sidebar(ws,p);
}

// ── Guild commands ────────────────────────────────────────────────────────
function guildCmd(ws,p,sub,rest){
  switch(sub){
    case'create':{
      if(p.guildId)return say(ws,`Already in guild: ${guilds[p.guildId]?.name}. Leave first.`,'err');
      if(!rest)return say(ws,'GUILD CREATE [name]','err');
      const gname=rest.slice(0,30).replace(/[^a-zA-Z0-9 ]/g,'').trim();
      if(gname.length<3)return say(ws,'Name must be at least 3 characters.','err');
      if(Object.values(guilds).find(g=>g.name.toLowerCase()===gname.toLowerCase()))return say(ws,'That name is taken.','err');
      const gid='g'+Date.now();
      guilds[gid]={name:gname,leader:p.username,members:[p.username],bank:0,motd:''};
      p.guildId=gid;saveGuilds();svc(p);
      say(ws,`Guild "${gname}" founded! You are the Guild Leader.`,'ok');
      checkAch(ws,p,'guild_founder');break;
    }
    case'join':{
      if(p.guildId)return say(ws,'Already in a guild. Leave first (GUILD LEAVE).','err');
      if(!rest)return say(ws,'GUILD JOIN [name]','err');
      const entry=Object.entries(guilds).find(([,g])=>g.name.toLowerCase()===rest.toLowerCase());
      if(!entry)return say(ws,`Guild "${rest}" not found.`,'err');
      const[gid,g]=entry;g.members.push(p.username);p.guildId=gid;saveGuilds();svc(p);
      say(ws,`You join "${g.name}"!`,'ok');
      [...sessions.values()].filter(x=>x.loggedIn&&x.guildId===gid&&x.username!==p.username)
        .forEach(x=>say(x.ws,`${p.name} joined ${g.name}!`,'ok'));
      break;
    }
    case'leave':{
      if(!p.guildId)return say(ws,'Not in a guild.','err');
      const g=guilds[p.guildId];if(!g)return;
      g.members=g.members.filter(u=>u!==p.username);
      if(g.members.length===0)delete guilds[p.guildId];
      else if(g.leader===p.username)g.leader=g.members[0];
      p.guildId='';saveGuilds();svc(p);say(ws,`You leave the guild.`,'ok');break;
    }
    case'info':case'':case undefined:{
      if(!p.guildId&&!rest)return say(ws,'Not in a guild. GUILD LIST to see all guilds.','sys');
      const entry=rest?Object.entries(guilds).find(([,g])=>g.name.toLowerCase()===rest.toLowerCase()):[p.guildId,guilds[p.guildId]];
      if(!entry||!entry[1])return say(ws,'Guild not found.','err');
      const[,g]=entry;
      say(ws,`─── ${g.name} ─────────────────────────`,'loot');
      say(ws,`  Leader: ${g.leader}  Members: ${g.members.length}  Bank: ${g.bank}g`,'sys');
      if(g.motd)say(ws,`  MOTD: ${g.motd}`,'narrate');
      say(ws,`  Members: ${g.members.join(', ')}`,'sys');break;
    }
    case'list':{
      const all=Object.values(guilds);
      if(!all.length)return say(ws,'No guilds yet. GUILD CREATE [name] to found one.','sys');
      say(ws,'─── Active Guilds ─────────────────────────','sys');
      all.forEach(g=>say(ws,`  ${g.name.padEnd(20)} ${g.members.length} members  Leader: ${g.leader}`,'sys'));break;
    }
    case'chat':case'gc':{
      if(!p.guildId)return say(ws,'Not in a guild.','err');
      if(!rest)return say(ws,'GC [message]','err');
      const g=guilds[p.guildId];
      [...sessions.values()].filter(x=>x.loggedIn&&x.guildId===p.guildId)
        .forEach(x=>say(x.ws,`[${g.name}] ${p.name}: ${rest}`,'tell'));break;
    }
    case'deposit':{
      if(!p.guildId)return say(ws,'Not in a guild.','err');
      const amt=parseInt(rest);if(isNaN(amt)||amt<1)return say(ws,'GUILD DEPOSIT [amount]','err');
      if(p.gold<amt)return say(ws,`Not enough gold.`,'err');
      p.gold-=amt;guilds[p.guildId].bank+=amt;saveGuilds();svc(p);
      say(ws,`Deposited ${amt}g. Bank total: ${guilds[p.guildId].bank}g.`,'ok');break;
    }
    case'withdraw':{
      if(!p.guildId)return say(ws,'Not in a guild.','err');
      const g=guilds[p.guildId];
      if(g.leader!==p.username)return say(ws,'Only the leader can withdraw.','err');
      const amt=parseInt(rest);if(isNaN(amt)||amt<1||g.bank<amt)return say(ws,`Can't withdraw ${amt}g. Bank has ${g.bank}g.`,'err');
      g.bank-=amt;p.gold+=amt;saveGuilds();svc(p);say(ws,`Withdrew ${amt}g.`,'ok');break;
    }
    case'motd':{
      if(!p.guildId)return say(ws,'Not in a guild.','err');
      const g=guilds[p.guildId];
      if(g.leader!==p.username)return say(ws,'Only the leader can set MOTD.','err');
      g.motd=rest.slice(0,100);saveGuilds();
      [...sessions.values()].filter(x=>x.loggedIn&&x.guildId===p.guildId)
        .forEach(x=>say(x.ws,`[${g.name}] MOTD: ${g.motd}`,'narrate'));break;
    }
    default:say(ws,'GUILD: CREATE JOIN LEAVE INFO LIST CHAT DEPOSIT WITHDRAW MOTD','sys');
  }
}

// ── Guild room commands ───────────────────────────────────────────────────
function doGuildVaultCmd(ws,p,cmd,amount){
  const rm=world[p.room]; if(!rm||!rm.guildVault)return say(ws,'Not in the guild vault.','err');
  const g=guilds[rm.guildVault]; if(!g)return say(ws,'Guild not found.','err');
  if(!g.members.includes(p.username))return say(ws,'You are not a member of this guild.','err');
  const amt=parseInt(amount);
  if(cmd==='deposit'){
    if(isNaN(amt)||amt<1)return say(ws,'DEPOSIT [amount] — deposit gold into the guild vault.','err');
    if(p.gold<amt)return say(ws,`Not enough gold. You have ${p.gold}g.`,'err');
    p.gold-=amt; g.bank+=amt; saveGuilds(); svc(p);
    say(ws,`You slide ${amt} gold coins through the vault grate.`,'narrate');
    say(ws,`✓ Deposited ${amt}g. Guild bank now holds ${g.bank}g.`,'ok');
    // Notify online guild members
    [...sessions.values()].filter(x=>x.loggedIn&&x.guildId===p.guildId&&x.ws!==ws)
      .forEach(x=>say(x.ws,`[${g.name}] ${p.name} deposited ${amt}g into the vault.`,'narrate'));
  } else if(cmd==='withdraw'){
    if(g.leader!==p.username)return say(ws,'Only the guild leader may withdraw from the vault.','err');
    if(isNaN(amt)||amt<1)return say(ws,'WITHDRAW [amount] — withdraw gold from the guild vault.','err');
    if(g.bank<amt)return say(ws,`The vault only holds ${g.bank}g.`,'err');
    g.bank-=amt; p.gold+=amt; saveGuilds(); svc(p);
    say(ws,`You unlock the grate and retrieve ${amt} gold coins.`,'narrate');
    say(ws,`✓ Withdrew ${amt}g. Guild bank now holds ${g.bank}g.`,'ok');
    [...sessions.values()].filter(x=>x.loggedIn&&x.guildId===p.guildId&&x.ws!==ws)
      .forEach(x=>say(x.ws,`[${g.name}] ${p.name} withdrew ${amt}g from the vault.`,'narrate'));
  } else {
    // VAULT with no command — show balance and instructions
    say(ws,`── ${g.name} Bank Vault ────────────────`,'loot');
    say(ws,`  Current balance: ${g.bank}g`,'sys');
    say(ws,`  DEPOSIT [amount]  — add your gold to the guild bank`,'sys');
    if(g.leader===p.username) say(ws,`  WITHDRAW [amount] — take gold from the guild bank (leader only)`,'sys');
    else say(ws,`  Only ${g.leader} (leader) may withdraw.`,'sys');
  }
}

function doGuildStorageCmd(ws,p,cmd,item){
  const rm=world[p.room]; if(!rm||!rm.guildStorage)return say(ws,'Not in the guild storage.','err');
  const g=guilds[rm.guildStorage]; if(!g)return say(ws,'Guild not found.','err');
  if(!g.members.includes(p.username))return say(ws,'You are not a member of this guild.','err');
  if(!g.storage)g.storage=[];
  if(cmd==='store'||cmd==='donate'){
    if(!item)return say(ws,'STORE [item] — donate an item to the guild storage.','err');
    const idx=p.inventory.findIndex(i=>i.toLowerCase().includes(item.toLowerCase()));
    if(idx===-1)return say(ws,`You don't have "${item}".`,'err');
    const donated=p.inventory.splice(idx,1)[0];
    g.storage.push(donated);
    // Keep storage room items in sync
    const storageId='storage_'+rm.guildStorage;
    if(world[storageId])world[storageId].items=[...g.storage];
    saveGuilds(); svc(p);
    say(ws,`You place the ${donated} on the guild storage shelf.`,'narrate');
    say(ws,`✓ ${donated} added to guild storage.`,'ok');
    [...sessions.values()].filter(x=>x.loggedIn&&x.guildId===p.guildId&&x.ws!==ws)
      .forEach(x=>say(x.ws,`[${g.name}] ${p.name} donated ${donated} to the storage.`,'narrate'));
  } else if(cmd==='retrieve'||cmd==='take'){
    if(!item)return say(ws,'RETRIEVE [item] — take an item from guild storage.','err');
    const idx=g.storage.findIndex(i=>i.toLowerCase().includes(item.toLowerCase()));
    if(idx===-1)return say(ws,`"${item}" not found in guild storage.`,'err');
    const taken=g.storage.splice(idx,1)[0];
    p.inventory.push(taken);
    const storageId='storage_'+rm.guildStorage;
    if(world[storageId])world[storageId].items=[...g.storage];
    saveGuilds(); svc(p);
    say(ws,`You take the ${taken} from the shelf.`,'narrate');
    say(ws,`✓ ${taken} added to your inventory.`,'ok');
    [...sessions.values()].filter(x=>x.loggedIn&&x.guildId===p.guildId&&x.ws!==ws)
      .forEach(x=>say(x.ws,`[${g.name}] ${p.name} took ${taken} from storage.`,'narrate'));
  } else {
    // Show storage contents
    say(ws,`── ${g.name} Storage Closet ──────────────`,'loot');
    if(!g.storage.length) say(ws,'  Storage is empty. STORE [item] to donate.','sys');
    else {
      say(ws,`  ${g.storage.length} item${g.storage.length>1?'s':''} available:`,'sys');
      g.storage.forEach((item,i)=>say(ws,`  ${i+1}. ${item}`,'narrate'));
      say(ws,'  RETRIEVE [item] to take  |  STORE [item] to donate','sys');
    }
  }
}

function doGuildBed(ws,p){
  const rm=world[p.room]; if(!rm||!rm.guildBed)return say(ws,'No recovery bed here.','err');
  const g=guilds[rm.guildBed]; if(!g)return say(ws,'Guild not found.','err');
  if(!g.members.includes(p.username))return say(ws,'You are not a member of this guild.','err');
  if(p.hp>=p.maxhp)return say(ws,'You are already at full health.','sys');
  say(ws,'You lie down on the recovery bed. The healing runes begin to glow...','narrate');
  say(ws,'Restoring in 10 seconds — stay in the room.','sys');
  const startRoom=p.room;
  setTimeout(()=>{
    // Only heal if still in the recovery room
    if(p.room!==startRoom||!p.loggedIn){
      say(ws,'Recovery interrupted — you left the room.','err'); return;
    }
    p.hp=p.maxhp; svc(p);
    say(ws,'The runes pulse with golden light. You are fully restored!','ok');
    say(ws,`HP fully restored: ${p.hp}/${p.maxhp}`,'ok');
    sidebar(ws,p);
  },10000);
}

function buildGuildRooms(gid){
  const g=guilds[gid]; if(!g)return;
  const hallId   = 'hall_'+gid;
  const vaultId  = 'vault_'+gid;
  const storageId= 'storage_'+gid;
  const bedId    = 'bed_'+gid;
  // Initialise storage if not present
  if(!g.storage)g.storage=[];
  // Main Hall
  world[hallId]={zone:'GUILD HALLS',name:`${g.name} — Main Hall`,
    desc:`The main hall of ${g.name}. Trophies and banners line the walls.${g.motd?' A sign reads: "'+g.motd+'"':''} Doors lead to the Vault (east), Storage (west), and Recovery Room (north).`,
    exits:{out:'guild_hall_row',east:vaultId,west:storageId,north:bedId},
    items:[],monsters:[],shop:null,guildHall:gid};
  // Bank Vault
  world[vaultId]={zone:'GUILD HALLS',name:`${g.name} — Bank Vault`,
    desc:`The guild vault. Gold bars are stacked behind an iron grate. Only the guild leader may withdraw. All members may deposit.`,
    exits:{west:hallId},items:[],monsters:[],shop:null,guildVault:gid};
  // Storage Closet
  world[storageId]={zone:'GUILD HALLS',name:`${g.name} — Storage Closet`,
    desc:`Shelves of equipment left by guild members for others to use. Anyone in the guild may leave or take items.`,
    exits:{east:hallId},items:[...(g.storage||[])],monsters:[],shop:null,guildStorage:gid};
  // Recovery Room
  world[bedId]={zone:'GUILD HALLS',name:`${g.name} — Recovery Room`,
    desc:`A clean room with a row of recovery beds. The healing runes on the walls glow softly. Type BED to use a recovery bed — restores full HP in 10 seconds.`,
    exits:{south:hallId},items:[],monsters:[],shop:null,guildBed:gid};
}

function doGuildHall(ws,p){
  if(!p.guildId||!guilds[p.guildId])return say(ws,'Not in a guild. Visit the Guild District (north of Temple).','err');
  const g=guilds[p.guildId];
  buildGuildRooms(p.guildId);
  const hallId='hall_'+p.guildId;
  p.room=hallId;describeRoom(ws,p);
  say(ws,'','sys');
  say(ws,`─── ${g.name} ─ Guild Info ─────────────`,'loot');
  say(ws,`  Leader: ${g.leader}  Members: ${g.members.length}  Bank: ${g.bank}g`,'sys');
  g.members.forEach(u=>{
    const m=[...sessions.values()].find(x=>x.username===u&&x.loggedIn);
    say(ws,m?`  ✓ ${m.name} the ${m.raceName} ${m.className} Lv${m.level}`:`  ○ ${u} (offline)`,'sys');
  });
  say(ws,'  Rooms: EAST=Vault  WEST=Storage  NORTH=Recovery Bed  OUT=Exit','sys');
  say(ws,'  GC [msg] for guild chat','sys');
  sidebar(ws,p);
}

// ── Party commands ────────────────────────────────────────────────────────
function partyCmd(ws,p,sub,rest){
  switch(sub){
    case'invite':{
      if(!rest)return say(ws,'PARTY INVITE [player]','err');
      const tgt=[...sessions.values()].find(x=>x.loggedIn&&x.name&&x.name.toLowerCase()===rest.toLowerCase());
      if(!tgt)return say(ws,`${rest} is not online.`,'err');
      let myP=getParty(p.username);
      if(!myP){const pid=`p${++partySeq}`;parties.set(pid,{leader:p.username,members:new Set([p.username]),invites:new Set()});myP=getParty(p.username);checkAch(ws,p,'party_up');}
      const party=parties.get(myP.id);
      if(party.leader!==p.username)return say(ws,'Only the leader can invite.','err');
      party.invites.add(tgt.username);
      say(ws,`Party invite sent to ${tgt.name}.`,'ok');
      say(tgt.ws,`${p.name} invites you to their party! PARTY JOIN ${p.name} to accept.`,'ok');break;
    }
    case'join':{
      if(!rest)return say(ws,'PARTY JOIN [leader name]','err');
      const ldr=[...sessions.values()].find(x=>x.loggedIn&&x.name&&x.name.toLowerCase()===rest.toLowerCase());
      if(!ldr)return say(ws,'Player not found.','err');
      const lp=getParty(ldr.username);if(!lp)return say(ws,'That player is not in a party.','err');
      const party=parties.get(lp.id);
      if(!party.invites.has(p.username))return say(ws,'You have not been invited.','err');
      if(getParty(p.username))return say(ws,'Already in a party. PARTY LEAVE first.','err');
      party.invites.delete(p.username);party.members.add(p.username);
      checkAch(ws,p,'party_up');
      [...party.members].forEach(u=>{const m=[...sessions.values()].find(x=>x.username===u&&x.loggedIn);if(m)say(m.ws,`${p.name} joined the party!`,'ok');});break;
    }
    case'leave':{
      const myP=getParty(p.username);if(!myP)return say(ws,'Not in a party.','err');
      const party=parties.get(myP.id);party.members.delete(p.username);say(ws,'You leave the party.','ok');
      if(party.members.size===0)parties.delete(myP.id);
      else{if(party.leader===p.username)party.leader=[...party.members][0];
        [...party.members].forEach(u=>{const m=[...sessions.values()].find(x=>x.username===u&&x.loggedIn);if(m)say(m.ws,`${p.name} left the party.`,'sys');});}break;
    }
    case'follow':{
      const myP=getParty(p.username);if(!myP)return say(ws,'Not in a party.','err');
      const party=parties.get(myP.id);
      if(party&&party.leader===p.username)return say(ws,'You are the leader — members follow you automatically when PARTY FOLLOW is on.','sys');
      p.partyFollow=!p.partyFollow;
      say(ws,p.partyFollow?'Now following the party leader. They move, you move.':'Stopped following.','ok');break;
    }
    case'info':case'':case undefined:{
      const myP=getParty(p.username);if(!myP)return say(ws,'Not in a party. PARTY INVITE [player] to start one.','sys');
      const party=parties.get(myP.id);if(!party)return;
      say(ws,'─── Party ───────────────────────────','sys');
      [...party.members].forEach(u=>{const m=[...sessions.values()].find(x=>x.username===u&&x.loggedIn);if(m)say(ws,`  ${m.name} Lv${m.level}${party.leader===u?' [Leader]':''}${m.partyFollow?' →':''}  — ${world[m.room]?.name||m.room}`,'sys');});break;
    }
    case'chat':case'pc':{
      const myP=getParty(p.username);if(!myP)return say(ws,'Not in a party.','err');
      if(!rest)return say(ws,'PC [message]','err');
      const party=parties.get(myP.id);if(!party)return;
      [...party.members].forEach(u=>{const m=[...sessions.values()].find(x=>x.username===u&&x.loggedIn);if(m)say(m.ws,`[Party] ${p.name}: ${rest}`,'tell');});break;
    }
    case'kick':{
      const myP=getParty(p.username);if(!myP)return say(ws,'Not in a party.','err');
      const party=parties.get(myP.id);if(!party||party.leader!==p.username)return say(ws,'Only the leader can kick.','err');
      if(!rest)return say(ws,'PARTY KICK [player]','err');
      const kt=[...party.members].find(u=>{const m=[...sessions.values()].find(x=>x.username===u);return m&&m.name.toLowerCase()===rest.toLowerCase();});
      if(!kt)return say(ws,'Not in your party.','err');
      party.members.delete(kt);
      const kws=[...sessions.entries()].find(([,x])=>x.username===kt);
      if(kws)say(kws[0],`You were kicked by ${p.name}.`,'err');
      say(ws,`${rest} kicked.`,'ok');break;
    }
    default:say(ws,'PARTY: INVITE JOIN LEAVE FOLLOW INFO CHAT KICK','sys');
  }
}

// ── Trade ─────────────────────────────────────────────────────────────────
const pendingTrades=new Map();
function tradeCmd(ws,p,rest){
  const parts=(rest||'').split(' '),sub=parts[0].toLowerCase();
  if(sub==='cancel'){pendingTrades.delete(p.username);say(ws,'Trade cancelled.','ok');return;}
  if(sub==='offer'){
    const t=pendingTrades.get(p.username);if(!t)return say(ws,'No active trade. TRADE [player] to start.','err');
    const q=parts.slice(1).join(' ');const gold=parseInt(q);
    if(!isNaN(gold)&&gold>0){
      if(p.gold<gold)return say(ws,`Not enough gold.`,'err');
      t.offeredGold=(t.offeredGold||0)+gold;say(ws,`Added ${gold}g to offer.`,'ok');
    }else{
      const idx=p.inventory.findIndex(i=>i.toLowerCase().includes(q.toLowerCase()));
      if(idx===-1)return say(ws,"You don't have that.",'err');
      t.offeredItems.push(p.inventory[idx]);say(ws,`Added ${p.inventory[idx]} to offer.`,'ok');
    }
    const partner=[...sessions.values()].find(x=>x.username===t.with&&x.loggedIn);
    const offerText=`${p.name} offers: ${t.offeredItems.join(', ')||'nothing'}${t.offeredGold?` + ${t.offeredGold}g`:''}`;
    say(ws,offerText,'shop');if(partner)say(partner.ws,offerText,'shop');return;
  }
  if(sub==='confirm'){
    const t=pendingTrades.get(p.username);if(!t)return say(ws,'No active trade.','err');
    const partner=[...sessions.values()].find(x=>x.username===t.with&&x.loggedIn);
    if(!partner)return say(ws,'Trade partner is offline.','err');
    const pt=pendingTrades.get(t.with);
    if(!pt||!pt.confirmed){t.confirmed=true;say(ws,'Confirmed. Waiting for partner (TRADE CONFIRM).','ok');if(partner)say(partner.ws,`${p.name} confirmed. TRADE CONFIRM to complete.`,'ok');return;}
    // Execute
    t.offeredItems.forEach(item=>{const i=p.inventory.indexOf(item);if(i>=0)p.inventory.splice(i,1);partner.inventory.push(item);});
    pt.offeredItems.forEach(item=>{const i=partner.inventory.indexOf(item);if(i>=0)partner.inventory.splice(i,1);p.inventory.push(item);});
    p.gold-=(t.offeredGold||0);partner.gold+=(t.offeredGold||0);
    partner.gold-=(pt.offeredGold||0);p.gold+=(pt.offeredGold||0);
    pendingTrades.delete(p.username);pendingTrades.delete(t.with);
    say(ws,`✓ Trade complete! Received: ${pt.offeredItems.join(', ')||'nothing'}${pt.offeredGold?` + ${pt.offeredGold}g`:''}`,'ok');
    say(partner.ws,`✓ Trade complete! Received: ${t.offeredItems.join(', ')||'nothing'}${t.offeredGold?` + ${t.offeredGold}g`:''}`,'ok');
    svc(p);svc(partner);sidebar(ws,p);sidebar(partner.ws,partner);return;
  }
  const tgt=[...sessions.values()].find(x=>x.loggedIn&&x.name&&x.name.toLowerCase()===rest.toLowerCase());
  if(!tgt)return say(ws,`${rest} is not online.`,'err');
  if(tgt.username===p.username)return say(ws,"Can't trade with yourself.",'err');
  pendingTrades.set(p.username,{with:tgt.username,offeredItems:[],offeredGold:0,confirmed:false});
  pendingTrades.set(tgt.username,{with:p.username,offeredItems:[],offeredGold:0,confirmed:false});
  say(ws,`Trade opened with ${tgt.name}. TRADE OFFER [item/gold], then TRADE CONFIRM.`,'shop');
  say(tgt.ws,`${p.name} wants to trade! TRADE OFFER [item/gold], TRADE CONFIRM, or TRADE CANCEL.`,'shop');
}

// ── Admin commands ────────────────────────────────────────────────────────
function adminCmd(ws,p,raw){
  const parts=raw.trim().split(/\s+/),v=parts[0].toLowerCase(),rest=parts.slice(1).join(' ');
  say(ws,`[ADMIN] ${raw}`,'loot');
  switch(v){
    case'/ci':{
      const m=rest.match(/^"([^"]+)"\s+(\w+)\s+(-?\d+)\s+(-?\d+)\s*(.*)$/)||rest.match(/^(\S+)\s+(\w+)\s+(-?\d+)\s+(-?\d+)\s*(.*)$/);
      if(!m)return say(ws,'Usage: /ci "Item Name" [weapon/armor/potion] [atk] [def] [desc]','err');
      const[,name,type,atk,def,desc]=m;
      if(type==='weapon'||type==='armor')EQ[name.toLowerCase()]={t:type,atk:parseInt(atk),def:parseInt(def)};
      p.inventory.push(name);svc(p);say(ws,`✓ Created "${name}" (${type}) ATK:${atk} DEF:${def} — added to your inventory.`,'ok');sidebar(ws,p);break;
    }
    case'/give':case'/g':{
      const pp=rest.split(' '),tn=pp[0],item=pp.slice(1).join(' ');
      if(!tn||!item)return say(ws,'Usage: /give [player] [item]  — use "me" to give yourself','err');
      // /give me [item] — give to self
      if(tn.toLowerCase()==='me'||tn.toLowerCase()===p.name.toLowerCase()){
        p.inventory.push(item);svc(p);sidebar(ws,p);
        say(ws,`✓ Added "${item}" to your inventory.`,'ok');break;
      }
      const tgt=[...sessions.values()].find(x=>x.loggedIn&&x.name&&x.name.toLowerCase()===tn.toLowerCase());
      if(!tgt)return say(ws,`${tn} not online.`,'err');
      tgt.inventory.push(item);svc(tgt);sidebar(tgt.ws,tgt);
      say(ws,`✓ Gave "${item}" to ${tgt.name}.`,'ok');say(tgt.ws,`✨ ${p.name} gifted you: ${item}!`,'loot');break;
    }
    case'/gg':{
      const pp=rest.split(' '),tn=pp[0],amt=parseInt(pp[1]);
      if(!tn||isNaN(amt))return say(ws,'Usage: /gg [player] [amount]','err');
      const tgt=[...sessions.values()].find(x=>x.loggedIn&&x.name&&x.name.toLowerCase()===tn.toLowerCase());
      if(!tgt)return say(ws,`${tn} not online.`,'err');
      tgt.gold+=amt;svc(tgt);sidebar(tgt.ws,tgt);
      say(ws,`✓ Gave ${amt}g to ${tgt.name}.`,'ok');say(tgt.ws,`✨ ${p.name} granted you ${amt} gold!`,'loot');
      bAll({type:'line',text:`✨ ${tgt.name} has been blessed with gold by the Administrator!`,cls:'loot'});break;
    }
    case'/xp':{
      const pp=rest.split(' '),tn=pp[0],amt=parseInt(pp[1]);
      if(!tn||isNaN(amt))return say(ws,'Usage: /xp [player] [amount]','err');
      const tgt=[...sessions.values()].find(x=>x.loggedIn&&x.name&&x.name.toLowerCase()===tn.toLowerCase());
      if(!tgt)return say(ws,`${tn} not online.`,'err');
      tgt.xp+=amt;levelUp(tgt.ws,tgt);svc(tgt);sidebar(tgt.ws,tgt);
      say(ws,`✓ Gave ${amt} XP to ${tgt.name}.`,'ok');break;
    }
    case'/sl':{
      const pp=rest.split(' '),tn=pp[0],lvl=parseInt(pp[1]);
      if(!tn||isNaN(lvl))return say(ws,'Usage: /sl [player] [level]','err');
      const tgt=[...sessions.values()].find(x=>x.loggedIn&&x.name&&x.name.toLowerCase()===tn.toLowerCase());
      if(!tgt)return say(ws,`${tn} not online.`,'err');
      tgt.level=lvl;tgt.maxhp=30+lvl*12;tgt.hp=tgt.maxhp;tgt.atk=CLASSES[tgt.classId]?.atk+RACES[tgt.raceId]?.atk+(lvl-1)*2||tgt.atk;tgt.def=CLASSES[tgt.classId]?.def+RACES[tgt.raceId]?.def+(lvl-1)||tgt.def;tgt.xp=0;svc(tgt);sidebar(tgt.ws,tgt);
      say(ws,`✓ Set ${tgt.name} to Level ${lvl}.`,'ok');say(tgt.ws,`✨ Your level was set to ${lvl}!`,'loot');break;
    }
    case'/heal':{
      const tn=rest||p.name;
      const tgt=tn===p.name?p:[...sessions.values()].find(x=>x.loggedIn&&x.name&&x.name.toLowerCase()===tn.toLowerCase());
      if(!tgt)return say(ws,`${tn} not found.`,'err');
      tgt.hp=tgt.maxhp;tgt.inCombat=false;tgt.enemy=null;svc(tgt);sidebar(tgt.ws,tgt);
      say(ws,`✓ ${tgt.name} fully healed.`,'ok');if(tgt!==p)say(tgt.ws,`✨ Fully restored by ${p.name}!`,'ok');break;
    }
    case'/spawn':{
      if(!rest)return say(ws,'Usage: /spawn [item name]','err');
      if(!world[p.room])return say(ws,'Invalid room.','err');
      world[p.room].items.push(rest);
      say(ws,`✓ Spawned "${rest}" in ${world[p.room].name}.`,'ok');
      sayRoom(p.room,`A shimmer — "${rest}" appears on the ground!`,'loot',ws);break;
    }
    case'/goto':{
      if(!rest||!world[rest])return say(ws,`Room "${rest}" not found. Use /rooms to list.`,'err');
      p.room=rest;p.inCombat=false;p.enemy=null;describeRoom(ws,p);sidebar(ws,p);break;
    }
    case'/tp':{
      const pp=rest.split(' '),tn=pp[0],dest=pp[1];
      if(!tn||!dest)return say(ws,'Usage: /tp [player] [room_id / here]','err');
      const tgt=[...sessions.values()].find(x=>x.loggedIn&&x.name&&x.name.toLowerCase()===tn.toLowerCase());
      if(!tgt)return say(ws,`${tn} not online.`,'err');
      const rd=dest==='here'?p.room:dest;
      if(!world[rd])return say(ws,`Room "${rd}" not found.`,'err');
      tgt.room=rd;tgt.inCombat=false;tgt.enemy=null;describeRoom(tgt.ws,tgt);svc(tgt);sidebar(tgt.ws,tgt);
      say(ws,`✓ Teleported ${tgt.name} to ${world[rd].name}.`,'ok');say(tgt.ws,`✨ Teleported by ${p.name}.`,'loot');break;
    }
    case'/rooms':{
      say(ws,'─── All Rooms ─────────────────────────','sys');
      Object.entries(world).forEach(([id,rm])=>say(ws,`  ${id.padEnd(22)} ${rm.zone} — ${rm.name}`,'sys'));break;
    }
    case'/announce':case'/ann':{
      if(!rest)return say(ws,'Usage: /announce [message]','err');
      bAll({type:'line',text:`📢 ANNOUNCEMENT: ${rest}`,cls:'loot'});
      say(ws,`✓ Announced to all online players.`,'ok');break;
    }
    case'/players':case'/who':{
      const online=[...sessions.values()].filter(x=>x.loggedIn);
      say(ws,`─── Online (${online.length}) ─────────────────────────────────`,'sys');
      online.forEach(x=>say(ws,`  ${x.name.padEnd(16)} Lv${String(x.level).padStart(2)} ${x.raceName} ${x.className} — ${world[x.room]?.name||x.room} | HP:${x.hp}/${x.maxhp} Gold:${x.gold}`,'sys'));break;
    }
    case'/kick':{
      if(!rest)return say(ws,'Usage: /kick [player]','err');
      const tgt=[...sessions.values()].find(x=>x.loggedIn&&x.name&&x.name.toLowerCase()===rest.toLowerCase());
      if(!tgt)return say(ws,`${rest} not found.`,'err');
      say(tgt.ws,'You have been disconnected by the Administrator.','err');svc(tgt);
      setTimeout(()=>{try{tgt.ws.close();}catch{}},500);say(ws,`✓ Kicked ${tgt.name}.`,'ok');break;
    }
    case'/take':{
      const pp=rest.split(' '),tn=pp[0],q=pp.slice(1).join(' ');
      if(!tn||!q)return say(ws,'Usage: /take [player] [item]','err');
      const tgt=[...sessions.values()].find(x=>x.loggedIn&&x.name&&x.name.toLowerCase()===tn.toLowerCase());
      if(!tgt)return say(ws,`${tn} not found.`,'err');
      const idx=tgt.inventory.findIndex(i=>i.toLowerCase().includes(q.toLowerCase()));
      if(idx===-1)return say(ws,`${tgt.name} doesn't have that.`,'err');
      const removed=tgt.inventory.splice(idx,1)[0];svc(tgt);sidebar(tgt.ws,tgt);
      say(ws,`✓ Removed "${removed}" from ${tgt.name}.`,'ok');break;
    }
    case'/setstat':{
      const pp=rest.split(' '),tn=pp[0],stat=pp[1],val=parseInt(pp[2]);
      if(!tn||!stat||isNaN(val))return say(ws,'Usage: /setstat [player] [hp/maxhp/atk/def/gold] [value]','err');
      const tgt=[...sessions.values()].find(x=>x.loggedIn&&x.name&&x.name.toLowerCase()===tn.toLowerCase());
      if(!tgt)return say(ws,`${tn} not found.`,'err');
      if(!['hp','maxhp','atk','def','gold'].includes(stat))return say(ws,'Stat must be hp/maxhp/atk/def/gold','err');
      tgt[stat]=val;if(stat==='maxhp')tgt.hp=val;svc(tgt);sidebar(tgt.ws,tgt);
      say(ws,`✓ Set ${tgt.name}'s ${stat} to ${val}.`,'ok');break;
    }
    case'/wonder':{
      const sub=(rest||'').toLowerCase().trim();
      if(!sub||sub==='status'){ wonderStatus(ws); break; }
      if(sub==='pause'){
        _WND.paused=true;
        say(ws,'⏸ Wonder paused — no new images will be generated.','ok');
        NPCS.wonder.idle=["Wonder rests quietly, her lantern dimmed to a gentle glow."];
        break;
      }
      if(sub==='resume'){
        _WND.paused=false;
        NPCS.wonder.idle=["Wonder holds her lantern up to an empty wall, head tilted thoughtfully.","Wonder traces a faint outline in the air with one finger. 'Something beautiful belongs here.'","Wonder murmurs quietly: 'A picture is worth a thousand words — and the dungeon has been silent for too long.'","Wonder floats gently through the room, her lantern casting soft gold light on the walls.","Wonder pauses, consulting a tiny glowing ledger that seems to write itself."];
        say(ws,'▶ Wonder resumed — patrol and generation active.','ok');
        if(_WND.queue.length&&!_WND.busy)wonderProcessQueue();
        break;
      }
      if(sub==='clear'){
        const n=_WND.queue.length;_WND.queue=[];_WND.busy=false;
        say(ws,`✓ Wonder queue cleared (${n} tasks removed).`,'ok');break;
      }
      if(sub.startsWith('scan')){
        const target=rest.split(/\s+/)[1]||p.room;
        if(!world[target])return say(ws,`Room "${target}" not found.`,'err');
        const before=_WND.queue.length;
        wonderScanRoom(target);
        const added=_WND.queue.length-before;
        say(ws,`✓ Scanned "${world[target].name}" — added ${added} task(s) to queue.`,'ok');
        if(added&&!_WND.busy&&!_WND.paused)wonderProcessQueue();
        break;
      }
      if(sub==='scanall'){
        const before=_WND.queue.length;
        Object.keys(world).forEach(id=>wonderScanRoom(id));
        const added=_WND.queue.length-before;
        say(ws,`✓ Full world scan complete — added ${added} task(s) to queue.`,'ok');
        if(added){ _WND.fullScanDone=false; _WND.ideaMode=false; }
        else _WND.fullScanDone=true;
        if(added&&!_WND.busy&&!_WND.paused)wonderProcessQueue();
        break;
      }
      if(sub==='links'){
        // Audit only (no generation) — check every room for broken exits
        const before=_WND.stats.brokenLinks;
        let found=0;
        Object.entries(world).forEach(([id,rm])=>{
          Object.entries(rm.exits||{}).forEach(([dir,dest])=>{
            if(!world[dest]){found++;say(ws,`⚠ ${id} → ${dir} → "${dest}" (missing)`,'err');}
          });
        });
        _WND.stats.brokenLinks+=found;
        say(ws,`Links audit complete — ${found} broken exit(s) found.`,found?'err':'ok');
        break;
      }
      if(sub.startsWith('goto')){
        const target=rest.split(/\s+/)[1];
        if(!target||!world[target])return say(ws,`Room "${target}" not found.`,'err');
        _WND.room=target;NPCS.wonder.room=target;
        say(ws,`✓ Wonder moved to ${world[target].name} [${target}].`,'ok');break;
      }
      say(ws,'Wonder sub-commands: status | pause | resume | clear | scan [room] | scanall | links | goto [room]','sys');
      break;
    }
    case'/help':case'/?':{
      say(ws,'═══ ADMIN COMMANDS ════════════════════════','loot');
      say(ws,' /ci "Name" type atk def [desc]  Create item','sys');
      say(ws,' /give [player] [item]            Give item','sys');
      say(ws,' /take [player] [item]            Remove item','sys');
      say(ws,' /spawn [item]                   Spawn in room','sys');
      say(ws,' /gg [player] [gold]             Give gold','sys');
      say(ws,' /xp [player] [amount]           Give XP','sys');
      say(ws,' /sl [player] [level]            Set level','sys');
      say(ws,' /setstat [player] [stat] [val]  Set stat','sys');
      say(ws,' /heal [player]                  Fully heal','sys');
      say(ws,' /goto [room_id]                 Teleport self','sys');
      say(ws,' /tp [player] [room/here]        Teleport player','sys');
      say(ws,' /rooms                          List all rooms','sys');
      say(ws,' /announce [msg]                 Server announce','sys');
      say(ws,' /players                        Detailed who list','sys');
      say(ws,' /kick [player]                  Disconnect player','sys');
      say(ws,' /wonder [status|pause|resume|   World Keeper NPC:','sys');
      say(ws,'         clear|scan [room]|       image generation','sys');
      say(ws,'         scanall|links|goto [r]]  & link audit','sys');
      break;
    }
    default:say(ws,`Unknown admin command. Type /help.`,'err');
  }
}


// ── Main command handler ──────────────────────────────────────────────────
const DIRS={n:'north',s:'south',e:'east',w:'west',u:'up',d:'down',o:'out',
  north:'north',south:'south',east:'east',west:'west',up:'up',down:'down',out:'out'};
const OPP={north:'south',south:'north',east:'west',west:'east',up:'below',down:'above',out:'outside'};

function handleCmd(ws,p,rawCmd){
  const input=rawCmd.trim().toLowerCase();if(!input)return;
  // Suppress echo for "look [target]" commands — the card overlay is the feedback
  const _echoWords=input.split(/\s+/);
  const _echoVerb=_echoWords[0];
  const _echoHasTarget=_echoWords.length>1;
  const _silentLook=(_echoVerb==='look'||_echoVerb==='l')&&_echoHasTarget;
  if(!_silentLook) say(ws,`> ${rawCmd}`,'prompt');

  // Admin slash commands
  if(input.startsWith('/')){
    if(!p.isAdmin)return say(ws,"Unknown command. Type HELP.",'err');
    adminCmd(ws,p,rawCmd);return;
  }

  // Parse command and args early so alias resolution works
  const _words=input.split(/\s+/),v=_words[0],rest=_words.slice(1).join(' ');

  // Resolve aliases before processing
  const aliasResolved=(p.aliases||{})[v];
  if(aliasResolved&&v!==aliasResolved.split(' ')[0]){
    return handleCmd(ws,p,aliasResolved+(rest?' '+rest:''));
  }
  // ── COMBAT MODE ──────────────────────────────────────────────────────────
  if(p.inCombat){
    const m=p.enemy;
    if(!m||m.dead){p.inCombat=false;p.enemy=null;return;}
    if(v==='flee'||v==='run'||DIRS[v]){
      if((p.rageT||0)>0)return say(ws,'Cannot flee while raging!','err');
      const exits=Object.keys((world[p.room]?.exits)||{});
      if(!exits.length)return say(ws,'Nowhere to flee!','err');
      // Directional commands flee in the requested direction if possible, else any exit
      const wantDir=DIRS[v]||null;
      const dir=(wantDir&&exits.includes(wantDir))?wantDir:exits[0];
      p.room=world[p.room].exits[dir];p.inCombat=false;p.enemy=null;
      say(ws,`You break away and flee ${dir}!`,'narrate');describeRoom(ws,p);sidebar(ws,p);return;
    }
    if(v==='use'){
      const q=_words.slice(1).join(' ');
      const name=p.inventory.find(i=>i.toLowerCase().includes(q));
      if(!name)return say(ws,"You don't have that.",'err');
      if(!useConsumable(ws,p,name))return say(ws,"Can't use that in combat.",'err');
      p.inventory.splice(p.inventory.indexOf(name),1);
      monsterAttack(ws,p,m);sidebar(ws,p);return;
    }
    // Skill execution
    const cls=CLASSES[p.classId];
    const allSkills=[...(cls?.skills||[]),...(p.extraSkills||[])];const findSid=q=>allSkills.find(s=>{const sk=SK[s];return sk&&(sk.n.toLowerCase().includes(q)||s===q.replace(/ /g,'_'));});
    if(v==='skill'||v==='cast'){
      const sid=findSid(_words.slice(1).join(' '));
      if(!sid)return say(ws,'Unknown skill. Type SKILLS.','err');
      const cd=(p.cd||{})[sid]||0;if(cd>0)return say(ws,`${SK[sid].n} on cooldown: ${cd} turns.`,'err');
      if(!p.cd)p.cd={};
      const res=execSkill(ws,p,sid,m);
      p.cd[sid]=SK[sid].cd;
      if(res==='fled'){sidebar(ws,p);return;}
      if(m.hp<=0||m.dead)return killMonster(ws,p,m);
      if(!p.inCombat){sidebar(ws,p);return;}
      monsterAttack(ws,p,m);sidebar(ws,p);return;
    }
    if(v==='dodge'||v==='evade'){
      const _dAgi=p.agi||5;
      const _dChance=Math.min(75,25+Math.floor(_dAgi*1.5));
      p._dodging=true;
      say(ws,`You commit to evasion, sacrificing your attack! [AGI: ${_dAgi} → Dodge chance: ${_dChance}%]`,'skill');
      monsterAttack(ws,p,m);sidebar(ws,p);return;
    }
    if(['attack','a','fight','hit','strike'].includes(v)){playerAttack(ws,p);sidebar(ws,p);return;}
    // Bare skill name
    const sid=findSid(input);
    if(sid){
      const cd=(p.cd||{})[sid]||0;if(cd>0)return say(ws,`${SK[sid].n} on cooldown: ${cd} turns.`,'err');
      if(!p.cd)p.cd={};
      const res=execSkill(ws,p,sid,m);p.cd[sid]=SK[sid].cd;
      if(res==='fled'){sidebar(ws,p);return;}
      if(m.hp<=0||m.dead)return killMonster(ws,p,m);
      if(!p.inCombat){sidebar(ws,p);return;}
      monsterAttack(ws,p,m);sidebar(ws,p);
    }else if(v==='look'||v==='l'||v==='examine'||v==='ex'){
      // Allow inspect commands during combat — fall through to normal handler
    }else{
      say(ws,'ATTACK / FLEE / USE [item] / SKILL [name]','sys');
      return;
    }
  }

  // ── NORMAL MODE ──────────────────────────────────────────────────────────

  if(DIRS[v]){
    const dir=DIRS[v],rm=world[p.room];
    if(!rm){
      console.error('[MOVE] Room not found:',p.room,'for player',p.username);
      p.room='town_square';
      return say(ws,"Something went wrong. Returning to Town Square.",'err');
    }
    if(!rm.exits||!rm.exits[dir])return say(ws,"You can't go that way.",'err');
    // Secret arcade door lock
    if(p.room==='weaponsmith'&&dir==='north'&&!p.arcadeUnlocked){
      say(ws,"The iron door holds fast. Something is etched into it: a pixelated alien. Grimwald might know what's behind it.",'err');
      return;
    }
    const _oldRoom=p.room;
    // Auto-leave poker table when walking away
    if(_pt&&_pt.seats.find(s=>s.username===p.username)){
      _ptLeave(ws,p,'You stand up from the card table as you leave.');
    }
    sayRoom(p.room,`${p.name} heads ${dir}.`,'narrate',ws);
    p.room=rm.exits[dir];say(ws,`You head ${dir}.`,'narrate');
    describeRoom(ws,p);sayRoom(p.room,`${p.name} arrives from the ${OPP[dir]||'elsewhere'}.`,'narrate',ws);sidebar(ws,p);
    // Adventurer ambient chatter on room entry (20% chance)
    if(p.adventurers?.length&&Math.random()<0.20){
      const _ca=p.adventurers[rnd(0,p.adventurers.length-1)];
      const _cadv=ADVENTURERS[_ca.key];if(_cadv){
        setTimeout(()=>{
          const _fb=_cadv.idle[rnd(0,_cadv.idle.length-1)];
          say(ws,`${_cadv.name}: "${_fb}"`,'narrate');
        },800);
      }
    }
    sendRoomOccupants(_oldRoom);sendRoomOccupants(p.room);
    // Party follow
    const myP=getParty(p.username);
    if(myP){
      const party=parties.get(myP.id);
      if(party&&party.leader===p.username){
        [...party.members].forEach(u=>{
          if(u===p.username)return;
          const mate=[...sessions.values()].find(x=>x.username===u&&x.loggedIn);
          if(!mate||!mate.partyFollow||mate.inCombat)return;
          if(!world[mate.room]?.exits?.[dir]){say(mate.ws,`[Party] No ${dir} exit — couldn't follow ${p.name}.`,'sys');return;}
          mate.room=world[mate.room].exits[dir];
          say(mate.ws,`[Party] You follow ${p.name} ${dir}.`,'narrate');
          describeRoom(mate.ws,mate);sidebar(mate.ws,mate);
        });
      }
    }
    // Auto-engage — 30% chance monsters attack on entry (never in safe zones, never vs admins)
    const hostiles=(world[p.room]?.monsters||[]).filter(m=>!m.dead);
    if(hostiles.length&&!SAFE_ZONES.has(p.room)&&!p.isAdmin){
      if(rnd(1,100)<=30){
        // Monster attacks!
        p.inCombat=true;p.enemy=hostiles[0];
        say(ws,`The ${hostiles[0].name} snarls and lunges at you!`,'combat');
        say(ws,'ATTACK / FLEE / SKILL [name]  — or try to LOOK at it first.','sys');
        // Send portrait safely
        try{
          const _ap=MOB_PORTRAITS[hostiles[0].name];
          if(_ap)raw(ws,{type:'mob_portrait',name:hostiles[0].name,img:resolveImg('monsters',_ap),
            hp:hostiles[0].hp||0,maxhp:hostiles[0].maxhp||hostiles[0].hp||1,
            atk:hostiles[0].atk||0,def:hostiles[0].def||0});
        }catch(e){console.error('[PORTRAIT]',e.message);}
      }else{
        // Monster is present but not attacking — player can look or choose to engage
        const _idleLines=[
          `A ${hostiles[0].name} watches you warily.`,
          `A ${hostiles[0].name} paces nearby, not yet attacking.`,
          `A ${hostiles[0].name} eyes you with suspicion but holds back.`,
          `A ${hostiles[0].name} growls low — it hasn't attacked yet.`,
          `A ${hostiles[0].name} is here. It hasn't noticed you yet.`
        ];
        say(ws,_idleLines[rnd(0,_idleLines.length-1)],'narrate');
        say(ws,`ATTACK to engage, or LOOK ${hostiles[0].name.split(' ')[0].toLowerCase()} to examine it.`,'sys');
      }
    }
    return;
  }

  switch(v){
    case'look':case'l':{
      if(rest){
        const rl=rest.toLowerCase();
        // ── LOOK ROOM — detailed room profile card ───────────────────────
        if(rl==='room'||rl==='here'||rl==='around'){
          showRoomProfile(ws,p,p.room);break;
        }
        // ── Look at a direction — peek into adjacent room ──────────────────
        const dirMap={north:'north',south:'south',east:'east',west:'west',up:'up',down:'down',
                      n:'north',s:'south',e:'east',w:'west',u:'up',d:'down',out:'out',o:'out'};
        if(dirMap[rl]){
          const dir=dirMap[rl];
          const rm=world[p.room];
          const adjId=rm?.exits?.[dir];
          if(!adjId)return say(ws,`Nothing that way.`,'err');
          const adjRm=world[adjId];
          if(!adjRm)return say(ws,`Nothing that way.`,'err');
          say(ws,`You peer ${dir}...`,'narrate');
          say(ws,`[ ${adjRm.name} ]`,'loot');
          say(ws,adjRm.desc,'narrate');
          const visM=(adjRm.monsters||[]).filter(m=>!m.dead);
          if(visM.length) say(ws,`  You can make out: ${visM.map(m=>m.name).join(', ')}...`,'combat');
          const visI=adjRm.items||[];
          if(visI.length) say(ws,`  Something is on the ground: ${visI.join(', ')}.`,'loot');
          break;
        }
        // ── Look at shrine specifically ────────────────────────────────────
        if(rl==='shrine'||rl==='adventure shrine'){
          say(ws,'','sys');
          say(ws,'✦ ══════ THE ADVENTURE SHRINE ══════ ✦','skill');
          say(ws,'Seven ancient standing stones form a circle, each taller than two men.','narrate');
          say(ws,'Azure runes pulse across their faces — the names of distant lands written in a script older than Shadowmere itself.','narrate');
          say(ws,'At the centre, a shallow basin holds flame that burns without fuel. No wind touches it.','narrate');
          say(ws,'The Keeper tends these stones day and night, whispering coordinates to the flame.','narrate');
          say(ws,'Those who have proven themselves may step into the light and choose their destination.','narrate');
          say(ws,'','sys');
          say(ws,'To use the Shrine: go UP from Town Square, then type SHRINE to see destinations.','sys');
          say(ws,'Each zone requires a minimum level. The Shrine will not carry the unprepared.','sys');
          break;
        }
        // ── Check for animal companion of any player in room ──────────────
        const _compPlayers=[...sessions.values()].filter(x=>x.room===p.room&&x.loggedIn);
        let _compFound=null,_compOwner=null;
        for(const _cp of _compPlayers){
          const _c=((_cp.companions)||[]).find(c=>c.name.toLowerCase().includes(rl));
          if(_c){_compFound=_c;_compOwner=_cp;break;}
        }
        if(_compFound){showCompanionProfile(ws,_compFound,_compOwner.name);break;}
        // ── Check for zombie minion of any player in room ─────────────────
        let _zombFound=null,_zombOwner=null;
        for(const _cp of _compPlayers){
          const _z=((_cp.zombies)||[]).find(z=>z.name.toLowerCase().includes(rl));
          if(_z){_zombFound=_z;_zombOwner=_cp;break;}
        }
        if(_zombFound){showZombieProfile(ws,_zombFound,_zombOwner.name);break;}
        // ── Check for adventurer companion or tavern adventurer ────────────
        const advMatch=Object.entries(ADVENTURERS).find(([k,a])=>(a.name.toLowerCase().includes(rl)||a.shortName.toLowerCase()===rl)&&((p.adventurers||[]).find(x=>x.key===k)||a.room===p.room));
        if(advMatch){showAdvProfile(ws,p,advMatch[0]);break;}
        // ── Check for NPC in room ──────────────────────────────────────────
        const npcMatch=Object.values(NPCS).find(n=>n.room===p.room&&n.name.toLowerCase().includes(rl));
        if(npcMatch){showNPCProfile(ws,npcMatch);break;}
        // ── Check for monster in room ──────────────────────────────────────
        const mobMatch=(world[p.room]?.monsters||[]).find(m=>!m.dead&&m.name.toLowerCase().includes(rl));
        if(mobMatch){showMobProfile(ws,mobMatch);break;}
        // ── Check for another player ──────────────────────────────────────
        const tgt=[...sessions.values()].find(x=>x.loggedIn&&x.name&&x.name.toLowerCase()===rl);
        if(tgt){showProfile(ws,p,tgt);break;}
        // ── Check for item ─────────────────────────────────────────────────
        // Support "look equipped [name]" sent from sidebar equipped panel
        let _lookEquippedHint=false;
        let _rl2=rl;
        if(rl.startsWith('equipped ')){_lookEquippedHint=true;_rl2=rl.slice(9).trim();}
        const _roomItems=world[p.room]?.items||[];
        const allItems=[...p.inventory,..._roomItems,...p.equipped];
        const f=allItems.find(i=>i.toLowerCase().includes(_rl2));
        if(f){
          const fL=f.toLowerCase();
          const isEquipped=_lookEquippedHint||p.equipped.some(i=>i.toLowerCase()===fL);
          const isInInventory=p.inventory.some(i=>i.toLowerCase()===fL);
          const isOnGround=_roomItems.some(i=>i.toLowerCase()===fL);
          showItemProfile(ws,f,{isEquipped,isInInventory,isOnGround});
          break;
        }
        say(ws,`You don't see any "${rest}" here.`,'err');
      } else {
        describeRoom(ws,p);
      }
      break;
    }
    case'take':case'get':{
      const rm=world[p.room];if(!rm)break;
      const rl2=rest.toLowerCase();
      // GET ALL or GET — pick up everything in the room
      if(!rl2||rl2==='all'||rl2==='everything'){
        if(!(rm.items||[]).length)return say(ws,'Nothing here to pick up.','err');
        const taken=[...rm.items];rm.items=[];
        taken.forEach(it=>{
          p.inventory.push(it);
          say(ws,`You pick up the ${it}.`,'ok');
          const eq=EQ[it.toLowerCase()];
          if(eq)say(ws,`  [${eq.t.toUpperCase()}] ATK+${eq.atk} DEF+${eq.def} — EQUIP ${it} to use it.`,'sys');
        });
        if(taken.length>1)say(ws,`Picked up ${taken.length} items.`,'loot');
        sidebar(ws,p);break;
      }
      // GET [item] — pick up a specific item (or all matching if multiple)
      const matches=(rm.items||[]).filter(i=>i.toLowerCase().includes(rl2));
      if(!matches.length)return say(ws,`No '${rest}' here.`,'err');
      matches.forEach(it=>{
        const idx=rm.items.indexOf(it);
        if(idx>-1){
          rm.items.splice(idx,1);p.inventory.push(it);
          say(ws,`You pick up the ${it}.`,'ok');
          const eq=EQ[it.toLowerCase()];
          if(eq)say(ws,`  [${eq.t.toUpperCase()}] ATK+${eq.atk} DEF+${eq.def} — EQUIP ${it} to use it.`,'sys');
        }
      });
      sendRoomOccupants(p.room);
      sidebar(ws,p);break;
    }
    case'drop':{
      const idx=p.inventory.findIndex(i=>i.toLowerCase().includes(rest));
      if(idx===-1)return say(ws,"You don't have that.",'err');
      const it=p.inventory.splice(idx,1)[0];if(world[p.room])world[p.room].items.push(it);say(ws,`You drop the ${it}.`,'ok');sendRoomOccupants(p.room);sidebar(ws,p);break;
    }
    case'use':{
      const idx=p.inventory.findIndex(i=>i.toLowerCase().includes(rest));
      if(idx===-1)return say(ws,`You don't have '${rest}'.`,'err');
      const name=p.inventory[idx];
      if(useConsumable(ws,p,name)){p.inventory.splice(idx,1);sidebar(ws,p);return;}
      if(EQ[name.toLowerCase()]){
        if(doEquip(p,name,false)){const st=EQ[name.toLowerCase()];let msg=`Equipped ${name}.`;if(st){if(st.atk>0)msg+=` ATK+${st.atk}.`;if(st.def>0)msg+=` DEF+${st.def}.`;}say(ws,msg,'ok');sidebar(ws,p);}
        else say(ws,`Can't equip ${name}.`,'err');return;
      }
      if(name==='ancient tome'){p.atk+=4;p.inventory.splice(idx,1);say(ws,'ATK permanently +4!','ok');sidebar(ws,p);return;}
      if(name==='crude map'){showMap(ws);return;}
      say(ws,`Not sure how to use the ${name}.`,'sys');break;
    }
    case'equip':case'wear':case'wield':{
      const name=p.inventory.find(i=>i.toLowerCase().includes(rest));
      if(!name)return say(ws,"You don't have that.",'err');
      if(doEquip(p,name,false)){const st=EQ[name.toLowerCase()];let msg=`Equipped ${name}.`;if(st){if(st.atk>0)msg+=` ATK+${st.atk}.`;if(st.def>0)msg+=` DEF+${st.def}.`;}say(ws,msg,'ok');sidebar(ws,p);}
      else say(ws,`Can't equip ${name}.`,'err');break;
    }
    case'unequip':case'remove':{
      const name=p.equipped.find(e=>e.toLowerCase().includes(rest));
      if(!name)return say(ws,'Not equipped.','err');
      doUnequip(p,name,false);say(ws,`Unequipped ${name}.`,'ok');sidebar(ws,p);break;
    }
    case'attack':case'fight':case'kill':{
      if(!world[p.room])return;
      if(SAFE_ZONES.has(p.room))return say(ws,'⚔ This is a safe town area. No fighting allowed here.','err');
      const hostiles=(world[p.room].monsters||[]).filter(m=>!m.dead);
      if(!hostiles.length)return say(ws,'Nothing to attack here.','err');
      const m=(rest&&hostiles.find(x=>x.name.toLowerCase().includes(rest)))||hostiles[0];
      p.inCombat=true;p.enemy=m;
      say(ws,`You engage ${m.name}! [HP:${m.hp}/${m.maxhp}]`,'combat');
      say(ws,'ATTACK / FLEE / SKILL [name] / USE [item]','sys');
      sayRoom(p.room,`${p.name} engages ${m.name}!`,'combat',ws);sidebar(ws,p);break;
    }
    case'skill':case'cast':{
      const cls=CLASSES[p.classId];
      const allOOC=[...(cls?.skills||[]),...(p.extraSkills||[])];
      const sid=allOOC.find(s=>{const sk=SK[s];return sk&&(sk.n.toLowerCase().includes(rest)||s===rest.replace(/ /g,'_'));});
      if(!sid)return say(ws,'Unknown skill. Type SKILLS.','err');
      if(SK[sid].cmb)return say(ws,`${SK[sid].n} is combat-only.`,'err');
      const cd=(p.cd||{})[sid]||0;if(cd>0)return say(ws,`${SK[sid].n} on cooldown: ${cd} turns.`,'err');
      if(!p.cd)p.cd={};execSkill(ws,p,sid,null);p.cd[sid]=SK[sid].cd;sidebar(ws,p);break;
    }
    case'skills':case'abilities':{
      const cls=CLASSES[p.classId];if(!cls)return;
      say(ws,`─── ${cls.name} Skills ─────────────────────`,'sys');
      (cls.skills||[]).forEach(sid=>{const sk=SK[sid];if(!sk)return;const cd=(p.cd||{})[sid]||0;say(ws,`  ${sk.n.padEnd(18)}${sk.cmb?'':'✦ '}${cd>0?`[cd:${cd}]`:'[READY]'}`,'sys');});
      if(p.extraSkills&&p.extraSkills.length){
        say(ws,'  ─── Specialization Skills ──────────────','sys');
        p.extraSkills.forEach(sid=>{const sk=SK[sid];if(!sk)return;const cd=(p.cd||{})[sid]||0;say(ws,`  ${sk.n.padEnd(18)}${sk.cmb?'':'✦ '}${cd>0?`[cd:${cd}]`:'[READY]'} ★`,'skill');});
      }
      say(ws,'  ✦ = usable outside combat  ★ = specialization','sys');break;
    }
    case'challenge':{
      if(!rest){
        say(ws,'── CHALLENGE ──────────────────────────────────','sys');
        say(ws,'  NPC games  : CHALLENGE [npc name] [gold]','sys');
        say(ws,'  Player duel: CHALLENGE [player name]  (outside town only)','sys');
        say(ws,'  Examples   : CHALLENGE ZARA 50 | CHALLENGE TORMUND 20','sys');
        break;
      }
      // ── NPC game challenge check first (always allowed, even in towns) ──
      const _cParts=rest.trim().split(/\s+/);
      const _cNpcKey=(_cParts[0]||'').toLowerCase();
      const _cBet=parseInt(_cParts[1])||0;
      const _cEntry=Object.entries(NPCS).find(([k,n])=>n.room===p.room&&(k===_cNpcKey||k.includes(_cNpcKey)||n.name?.toLowerCase().includes(_cNpcKey)||n.shortName?.toLowerCase()===_cNpcKey));
      if(_cEntry){
        const [,_cNpc]=_cEntry;
        if(!_cNpc.gameChallenge)return say(ws,`${_cNpc.name} shakes their head. "I don't play games."`.replace(/"/g,"'"),'narrate');
        // ── Poker is server-side multiplayer — route to table ─────────────
        if(_cNpc.gameChallenge.game==='poker'){
          const _buyIn=Math.max(0,_cBet);
          if(_buyIn>0&&p.gold<_buyIn)return say(ws,`You only have ${p.gold}g.`,'err');
          if(_buyIn>0){p.gold-=_buyIn;sidebar(ws,p);}
          say(ws,`Crag nods. "Pull up a chair." You sit at his table.`,'narrate');
          _ptJoin(ws,p,_buyIn||_PT_START_STACK);
          break;
        }
        // ── All other games handled client-side ───────────────────────────
        if(_cBet<5)return say(ws,'Minimum bet is 5 gold.','err');
        if(p.gold<_cBet)return say(ws,`You only have ${p.gold}g. Not enough to wager ${_cBet}g.`,'err');
        p.gold-=_cBet;sidebar(ws,p);
        p._activeGame=_cNpc.gameChallenge.game;
        say(ws,`You ante up ${_cBet}g and sit across from ${_cNpc.name}...`,'narrate');
        if(ws.readyState===WS.OPEN)ws.send(JSON.stringify({type:'game_challenge',game:_cNpc.gameChallenge.game,title:_cNpc.gameChallenge.title,bet:_cBet,npc:_cNpc.name,playerSide:_cNpc.gameChallenge.playerSide||'defender'}));
        break;
      }
      // ── PvP challenge (blocked in safe zones) ──────────────────────────
      if(SAFE_ZONES.has(p.room))return say(ws,'⚔ No duelling in town. Take it outside.','err');
      const _tgt=[...sessions.values()].find(x=>x.loggedIn&&x.name.toLowerCase()===rest.toLowerCase());
      if(!_tgt)return say(ws,`No player or NPC named "${rest}" is here.`,'err');
      if(_tgt===p)return say(ws,"You can't challenge yourself.",'err');
      if(_tgt.room!==p.room)return say(ws,'You must be in the same room to challenge someone.','err');
      if(p.inCombat||_tgt.inCombat)return say(ws,'Cannot issue a challenge during combat.','err');
      const _ldiff=p.level-_tgt.level;
      const _mode=Math.abs(_ldiff)<=3?'⚔ Combat Duel':'🐉 Dragon Battle Trial';
      const _modeDesc=Math.abs(_ldiff)<=3?'a direct combat duel':'a Dragon Battle trial (level gap >3)';
      _pvpChallenges.set(_tgt.username,{challenger:p,levelDiff:_ldiff,expires:Date.now()+30000});
      say(ws,`You challenge ${_tgt.name} to ${_modeDesc}! Waiting for their response...`,'combat');
      say(_tgt.ws,`⚔ ${p.name} (Lv${p.level}) challenges you to ${_modeDesc}!`,'combat');
      say(_tgt.ws,`Type ACCEPT to fight or DECLINE to refuse. (30 seconds)`,'sys');
      if(_tgt.ws&&_tgt.ws.readyState===1) _tgt.ws.send(JSON.stringify({type:'pvp_challenge',challengerName:p.name,challengerLevel:p.level,targetLevel:_tgt.level,mode:_mode,modeDesc:_modeDesc}));
      setTimeout(()=>{
        if(_pvpChallenges.get(_tgt.username)?.challenger===p){
          _pvpChallenges.delete(_tgt.username);
          say(ws,`${_tgt.name} did not respond — challenge expired.`,'sys');
          if(_tgt.ws&&_tgt.ws.readyState===1) say(_tgt.ws,`${p.name}'s challenge has expired.`,'sys');
        }
      },30000);
      break;
    }
    case'accept':{
      const _ch=_pvpChallenges.get(p.username);
      if(!_ch)return say(ws,'You have no pending challenge to accept.','sys');
      if(Date.now()>_ch.expires){_pvpChallenges.delete(p.username);return say(ws,'That challenge has expired.','sys');}
      _pvpChallenges.delete(p.username);
      const _chal=_ch.challenger;
      if(!_chal.loggedIn||_chal.room!==p.room)return say(ws,'The challenger has left the area.','sys');
      if(p.inCombat||_chal.inCombat)return say(ws,'Cannot duel — someone is in combat.','err');
      const _ldiff=_chal.level-p.level; // positive = challenger higher
      sayRoom(p.room,`⚔ ${p.name} accepts ${_chal.name}'s challenge! A duel begins!`,'combat');
      if(Math.abs(_ldiff)<=3){
        pvpFight(_chal,p);
      }else{
        const _lower=_ldiff>0?p:_chal;
        const _higher=_ldiff>0?_chal:p;
        _pvpArcadeGames.set(_lower.username,{higherPlayer:_higher,lowerPlayer:_lower});
        say(_lower.ws,`🐉 You must win at Dragon Battle to overcome ${_higher.name}'s challenge! The arena opens...`,'skill');
        say(_higher.ws,`🐉 ${_lower.name} enters the Dragon Battle arena! Watch their fate...`,'narrate');
        if(_lower.ws&&_lower.ws.readyState===1) _lower.ws.send(JSON.stringify({type:'pvp_arcade',opponentName:_higher.name,opponentLevel:_higher.level}));
      }
      break;
    }
    case'decline':{
      const _ch=_pvpChallenges.get(p.username);
      if(!_ch)return say(ws,'You have no pending challenge.','sys');
      _pvpChallenges.delete(p.username);
      say(ws,`You decline ${_ch.challenger.name}'s challenge.`,'sys');
      say(_ch.challenger.ws,`${p.name} declines your challenge.`,'sys');
      break;
    }
    case'tame':doTame(ws,p);break;
    case'dismiss':{
      if(!p.companions) p.companions = [];
      if(p.companion && !p.companions.find(c=>c.name===p.companion.name)) p.companions.push(p.companion);
      // Check adventurers first
      if(rest&&p.adventurers?.length){
        const _dai=p.adventurers.findIndex(a=>a.name.toLowerCase().includes(rest.toLowerCase())||ADVENTURERS[a.key]?.shortName.toLowerCase()===rest.toLowerCase());
        if(_dai!==-1){
          const _da=p.adventurers.splice(_dai,1)[0];
          const _dadv=ADVENTURERS[_da.key];
          say(ws,`${_da.name} parts ways with you.`,'ok');
          say(ws,`  "${_dadv?.dismissLine||'Farewell.'}"`,'narrate');
          if(_dadv)showAdvProfile(ws,p,_da.key);
          sidebar(ws,p);break;
        }
      }
      if(!p.companions.length && !p.zombies?.length && !p.adventurers?.length) return say(ws,'No companions or zombies to dismiss.','sys');
      if(rest.toLowerCase().startsWith('zombie')){
        // DISMISS ZOMBIE [#]
        const num=parseInt(rest.split(' ')[1]||'1')-1;
        if(!p.zombies||!p.zombies[num])return say(ws,'No zombie at that number. ZOMBIES to list.','err');
        const zn=p.zombies.splice(num,1)[0];
        say(ws,`${zn.name} crumbles to dust.`,'narrate');sidebar(ws,p);break;
      }
      if(!rest){
        // No arg — dismiss first companion or show list
        if(p.companions.length===1){
          const c=p.companions.pop(); p.companion=null;
          say(ws,`${c.name} parts ways and returns to the wild.`,'narrate');sidebar(ws,p);break;
        }
        if(p.companions.length>1){
          say(ws,'Multiple companions — DISMISS [name] to release a specific one:','sys');
          p.companions.forEach((c,i)=>say(ws,`  ${i+1}. ${c.name} [HP:${c.hp} ATK:${c.atk}]`,'sys'));
          break;
        }
        return say(ws,'No companions.','sys');
      }
      // DISMISS [name]
      const ci=p.companions.findIndex(c=>c.name.toLowerCase().includes(rest.toLowerCase()));
      if(ci===-1)return say(ws,`No companion named "${rest}".`,'err');
      const dismissed=p.companions.splice(ci,1)[0];
      p.companion=p.companions[0]||null;
      say(ws,`${dismissed.name} parts ways and returns to the wild.`,'narrate');
      sidebar(ws,p);break;
    }
    case'companion':case'companions':case'pet':{
      const _comps2=p.companions&&p.companions.length?p.companions:(p.companion?[p.companion]:[]);
      if(!_comps2.length)return say(ws,'No companions. Tame creatures with TAME skill + Beast Treat.','sys');
      say(ws,`── Companions (${_comps2.length}/${maxCompanions(p)} slots) ───────────`,'sys');
      _comps2.forEach((c,i)=>say(ws,`  ${i+1}. 🐾 ${c.name} [HP:${c.hp}/${c.maxhp} ATK:${c.atk}]`,'narrate'));
      say(ws,'DISMISS [name] to release one.','sys');break;
    }
    case'zombies':{
      if(!p.zombies||!p.zombies.length)return say(ws,`No zombies. Kill an enemy then use RAISE DEAD. (${maxZombies(p)} slot${maxZombies(p)>1?'s':''} available at Level ${p.level})`,'sys');
      say(ws,`── Zombies (${p.zombies.length}/${maxZombies(p)} slots) ────────────`,'sys');
      p.zombies.forEach((z,i)=>say(ws,`  ${i+1}. 🧟 ${z.name} [HP:${z.hp}/${z.maxhp} ATK:${z.atk}]`,'narrate'));
      say(ws,'DISMISS ZOMBIE [#] to release one.  CORPSE BOMB to detonate.','sys');break;
    }
    case'shop':case'list':{
      const sk=world[p.room]?.shop;if(!sk)return say(ws,'No shop here.','err');
      const sh=SHOPS[sk];
      // Send structured shop data for the visual UI
      raw(ws,{
        type:'shop_open',
        shopKey:sk,
        shopName:sh.name,
        greeting:sh.greet,
        gold:p.gold,
        items:sh.items.map(it=>({
          name:it.name, cost:it.cost, t:it.t||'misc',
          atk:it.atk||0, def:it.def||0,
          heal:it.heal||0, hp:it.hp||0,
          img:itemImg(it.name)
        })),
        sellable:(p.inventory||[]).map(name=>{
          let base=5;
          for(const sh of Object.values(SHOPS)){const fi=sh.items.find(i=>i.name===name);if(fi){base=fi.cost;break;}}
          return {name, sellPrice:Math.max(1,Math.floor(base*0.4)), img:itemImg(name)};
        })
      });
      break;
    }
    case'buy':{
      const sk=world[p.room]?.shop;if(!sk)return say(ws,'No shop here.','err');
      const sh=SHOPS[sk];
      if(sk==='pet_store'){
        const pet=sh.items.find(i=>i.name.toLowerCase().includes(rest));
        if(!pet)return say(ws,'That pet is not available. Type SHOP.','err');
        if(!p.companions)p.companions=[];
        if(p.companions.length>=maxCompanions(p))return say(ws,`Already have ${p.companions.map(c=>c.name).join(', ')}. DISMISS first.`,'err');
        if(p.gold<pet.cost)return say(ws,`Need ${pet.cost}g, have ${p.gold}g.`,'err');
        p.gold-=pet.cost;
        const _newPet={name:pet.name,atk:pet.atk,hp:pet.hp,maxhp:pet.hp,agi:pet.agi||5};
        p.companions.push(_newPet);p.companion=p.companions[0];
        say(ws,`You buy the ${pet.name} for ${pet.cost}g! A new companion joins you.`,'ok');svc(p);sidebar(ws,p);
        raw(ws,{type:'shop_update',gold:p.gold,boughtItem:pet.name,sellable:(p.inventory||[]).map(n=>{let b=5;for(const sh of Object.values(SHOPS)){const fi=sh.items.find(i=>i.name===n);if(fi){b=fi.cost;break;}}return{name:n,sellPrice:Math.max(1,Math.floor(b*0.4)),img:itemImg(n)};})});
        break;
      }
      const it=sh.items.find(i=>i.name.toLowerCase().includes(rest));
      if(!it)return say(ws,'Not sold here. Type SHOP.','err');
      if(p.gold<it.cost)return say(ws,`Need ${it.cost}g, have ${p.gold}g.`,'err');
      p.gold-=it.cost;p.inventory.push(it.name);
      if((it.t==='weapon'||it.t==='armor')&&!EQ[it.name.toLowerCase()])EQ[it.name.toLowerCase()]={t:it.t,atk:it.atk||0,def:it.def||0};
      say(ws,`Bought ${it.name} for ${it.cost}g.`,'ok');svc(p);sidebar(ws,p);
      // Refresh shop UI
      raw(ws,{type:'shop_update',gold:p.gold,boughtItem:it.name,sellable:(p.inventory||[]).map(name=>{let base=5;for(const sh of Object.values(SHOPS)){const fi=sh.items.find(i=>i.name===name);if(fi){base=fi.cost;break;}}return{name,sellPrice:Math.max(1,Math.floor(base*0.4)),img:itemImg(name)};})});
      break;
    }
    case'sell':{
      if(!world[p.room]?.shop)return say(ws,'No shop here.','err');
      const idx=p.inventory.findIndex(i=>i.toLowerCase().includes(rest));
      if(idx===-1)return say(ws,"You don't have that.",'err');
      const name=p.inventory[idx];if(p.equipped.includes(name))doUnequip(p,name,true);
      // Prospector pays good rates for mine materials
      const _ORE_PRICES={'copper ore':16,'coal':10,'iron ore':30,'silver ore':70,'iron ingot':40,'cave moss':8,'spider silk':12,'iron shard':24};
      const _atProspector=world[p.room]?.shop==='prospector';
      let base=5;
      if(_atProspector&&_ORE_PRICES[name.toLowerCase()]){
        base=_ORE_PRICES[name.toLowerCase()];
        p.inventory.splice(idx,1);p.gold+=base;
        say(ws,`Varn nods approvingly. Sold ${name} for ${base}g.`,'ok');svc(p);sidebar(ws,p);
        raw(ws,{type:'shop_update',gold:p.gold,soldItem:name,sellable:(p.inventory||[]).map(n=>{let b=5;for(const sh of Object.values(SHOPS)){const fi=sh.items.find(i=>i.name===n);if(fi){b=fi.cost;break;}}return{name:n,sellPrice:Math.max(1,Math.floor(b*0.4)),img:itemImg(n)};})});
        break;
      }
      for(const sh of Object.values(SHOPS)){const fi=sh.items.find(i=>i.name===name);if(fi){base=fi.cost;break;}}
      const sellGold=Math.max(1,Math.floor(base*0.4));
      p.inventory.splice(idx,1);p.gold+=sellGold;
      say(ws,`Sold ${name} for ${sellGold}g.`,'ok');svc(p);sidebar(ws,p);
      raw(ws,{type:'shop_update',gold:p.gold,soldItem:name,sellable:(p.inventory||[]).map(n=>{let b=5;for(const sh of Object.values(SHOPS)){const fi=sh.items.find(i=>i.name===n);if(fi){b=fi.cost;break;}}return{name:n,sellPrice:Math.max(1,Math.floor(b*0.4)),img:itemImg(n)};})});
      break;
    }
    case'recipes':case'crafting':{
      const shop=world[p.room]?.shop;
      const atSmith=shop==='weaponsmith'||shop==='apothecary';
      const atCrucible=shop==='the_crucible';
      if(!atSmith&&!atCrucible)return say(ws,'Crafting available at Weaponsmith, Apothecary, or The Crucible in Ashford.','err');
      if(atSmith){
        say(ws,'─── Crafting Recipes (Free) ─────────────────','shop');
        RECIPES.forEach((r,i)=>{
          const can=r.ing.every(ing=>p.inventory.some(x=>x.toLowerCase()===ing.toLowerCase()));
          say(ws,`  [${i+1}] ${r.name.padEnd(22)} ${r.ing.join(' + ')}${can?' [CAN CRAFT]':''}`,can?'ok':'sys');
        });
      }
      if(atCrucible){
        say(ws,'─── The Crucible — Advanced Recipes (Gold Cost) ─','shop');
        CRUCIBLE_RECIPES.forEach((r,i)=>{
          const can=r.ing.every(ing=>p.inventory.some(x=>x.toLowerCase()===ing.toLowerCase()))&&p.gold>=r.gold;
          say(ws,`  [${i+1}] ${r.name.padEnd(22)} ${r.ing.join(' + ')} — ${r.gold}g${can?' [CAN CRAFT]':''}`,can?'ok':'sys');
        });
      }
      say(ws,'CRAFT [name] to create.','sys');break;
    }
    case'craft':{
      const shop=world[p.room]?.shop;
      const atSmith=shop==='weaponsmith'||shop==='apothecary';
      const atCrucible=shop==='the_crucible';
      if(!atSmith&&!atCrucible)return say(ws,'Crafting available at Weaponsmith, Apothecary, or The Crucible in Ashford.','err');
      // Check Crucible first if at Crucible
      if(atCrucible){
        const cr=CRUCIBLE_RECIPES.find(r=>r.name.toLowerCase().includes(rest));
        if(cr){
          if(p.gold<cr.gold)return say(ws,`Not enough gold. ${cr.name} costs ${cr.gold}g.`,'err');
          const missing=[];const tmp=[...p.inventory];
          for(const ing of cr.ing){const i=tmp.findIndex(x=>x.toLowerCase()===ing.toLowerCase());if(i===-1)missing.push(ing);else tmp.splice(i,1);}
          if(missing.length)return say(ws,`Missing: ${missing.join(', ')}.`,'err');
          for(const ing of cr.ing){const i=p.inventory.findIndex(x=>x.toLowerCase()===ing.toLowerCase());p.inventory.splice(i,1);}
          p.gold-=cr.gold;p.inventory.push(cr.result);p.craftCount=(p.craftCount||0)+1;
          say(ws,`Torvar nods approvingly. ✓ Crafted: ${cr.result}! (-${cr.gold}g)`,'ok');
          checkAch(ws,p,'crafter');svc(p);sidebar(ws,p);break;
        }
      }
      const recipe=RECIPES.find(r=>r.name.toLowerCase().includes(rest));
      if(!recipe)return say(ws,'Unknown recipe. Type RECIPES.','err');
      if(!atSmith&&!atCrucible)return say(ws,'You must be at the Weaponsmith or Apothecary to use that recipe.','err');
      const missing=[];const tmp=[...p.inventory];
      for(const ing of recipe.ing){const i=tmp.findIndex(x=>x.toLowerCase()===ing.toLowerCase());if(i===-1)missing.push(ing);else tmp.splice(i,1);}
      if(missing.length)return say(ws,`Missing: ${missing.join(', ')}.`,'err');
      for(const ing of recipe.ing){const i=p.inventory.findIndex(x=>x.toLowerCase()===ing.toLowerCase());p.inventory.splice(i,1);}
      p.inventory.push(recipe.result);p.craftCount=(p.craftCount||0)+1;
      say(ws,`✓ Crafted: ${recipe.result}!`,'ok');
      checkAch(ws,p,'crafter');svc(p);sidebar(ws,p);break;
    }
    case'mine':{
      const _mineRm=world[p.room];
      if(!_mineRm?.mineable)return say(ws,'⛏ Nothing to mine here. Head to the Ironveil Mines west of town (WEST from Temple).','err');
      // Pickaxe must be equipped as a weapon
      const _equippedPick=p.equipped.find(e=>['iron pickaxe','steel pickaxe'].includes(e.toLowerCase()));
      if(!_equippedPick){
        const _hasPick=p.inventory.some(i=>['iron pickaxe','steel pickaxe'].includes(i.toLowerCase()));
        if(_hasPick)return say(ws,'⛏ Your pickaxe is stowed away. Type EQUIP PICKAXE to ready it first.','err');
        return say(ws,'⛏ You need a pickaxe equipped to mine. Buy one from Old Varn at the Mine Entrance (SHOP).','err');
      }
      const _isSteelPick=_equippedPick.toLowerCase()==='steel pickaxe';
      const _maxDur=_isSteelPick?20:10;
      // Initialise or reset durability if a different pickaxe was swapped in
      if(p.pickaxeDurability===undefined||p.pickaxeEquipped!==_equippedPick.toLowerCase()){
        p.pickaxeDurability=_maxDur;
        p.pickaxeEquipped=_equippedPick.toLowerCase();
      }
      // Strike — 40% ore drop rate
      p.pickaxeDurability--;
      const _mineRoll=rnd(1,100);
      if(_mineRoll<=40){
        const _minedOre=_mineRm.mineable[rnd(0,_mineRm.mineable.length-1)];
        p.inventory.push(_minedOre);
        say(ws,`⛏ Your pickaxe rings against the stone. Extracted: ${_minedOre}  [${p.pickaxeDurability}/${_maxDur} uses remaining]`,'loot');
      } else {
        say(ws,`⛏ You strike the rock but nothing breaks free.  [${p.pickaxeDurability}/${_maxDur} uses remaining]`,'narrate');
      }
      // Durability — break when exhausted
      if(p.pickaxeDurability<=0){
        doUnequip(p,_equippedPick,true);
        const _brokenIdx=p.inventory.lastIndexOf(_equippedPick);
        if(_brokenIdx>-1)p.inventory.splice(_brokenIdx,1);
        p.pickaxeDurability=undefined; p.pickaxeEquipped=undefined;
        say(ws,`💥 Your ${_equippedPick} shatters from the strain! You'll need a new one from Varn.`,'err');
      }
      // 20% chance of disturbing a mine mob
      if(rnd(1,100)<=20){
        const _activeM=(_mineRm.monsters||[]).filter(m=>!m.dead);
        if(_activeM.length>0&&!p.inCombat){
          const _distBase=_activeM[rnd(0,_activeM.length-1)];
          const _distM={..._distBase,hp:_distBase.maxhp,dead:false};
          say(ws,`The noise disturbs something in the dark! 🕷️ ${_distM.name} lunges from the shadows!`,'combat');
          p.inCombat=true;p.enemy=_distM;
          playerAttack(ws,p);
        }
      }
      svc(p);sidebar(ws,p);break;
    }
    case'shrine':showShrine(ws,p);break;
    case'teleport':case'tp':doTeleport(ws,p,rest);break;
    case'bag':case'openb':case'pack':{
      // Find equipped bag
      const myBag=p.equipped.find(e=>EQ[e.toLowerCase()]&&EQ[e.toLowerCase()].t==='bag');
      if(!myBag)return say(ws,'No bag equipped. Buy one at the Weaponsmith and EQUIP it.','err');
      const bk=EQ[myBag.toLowerCase()];
      const bagContents=p.bagContents||(p.bagContents={});
      const contents=bagContents[myBag]||[];
      say(ws,`=== ${myBag} (${contents.length}/${bk.slots} slots) ===`,'loot');
      if(!contents.length)say(ws,'  Empty.','sys');
      else contents.forEach((item,i)=>say(ws,`  [${i+1}] ${item}`,'sys'));
      say(ws,'  PUT [item] IN BAG  |  TAKE [item] FROM BAG  |  BAG CAPACITY: '+bk.slots+' slots','sys');
      break;
    }
    case'put':{
      // PUT [item] IN BAG
      if(!rest.toLowerCase().includes(' in '))return say(ws,'Usage: PUT [item] IN BAG','err');
      const[itemQ,bagQ]=rest.toLowerCase().split(' in ');
      const myBag=p.equipped.find(e=>EQ[e.toLowerCase()]&&EQ[e.toLowerCase()].t==='bag'&&e.toLowerCase().includes(bagQ.trim()));
      if(!myBag)return say(ws,'No matching bag equipped.','err');
      const bk=EQ[myBag.toLowerCase()];
      if(!p.bagContents)p.bagContents={};
      if(!p.bagContents[myBag])p.bagContents[myBag]=[];
      const contents=p.bagContents[myBag];
      if(contents.length>=bk.slots)return say(ws,`${myBag} is full! (${bk.slots}/${bk.slots} slots)`,'err');
      const idx=p.inventory.findIndex(i=>i.toLowerCase().includes(itemQ.trim()));
      if(idx===-1)return say(ws,"You don't have that item in your main inventory.",'err');
      const item=p.inventory.splice(idx,1)[0];
      contents.push(item);
      say(ws,`You put the ${item} in your ${myBag}. (${contents.length}/${bk.slots} slots)`,'ok');
      sidebar(ws,p);break;
    }
    case'take':{
      // TAKE [item] FROM BAG
      if(rest.toLowerCase().includes(' from ')){
        const[itemQ,bagQ]=rest.toLowerCase().split(' from ');
        const myBag=p.equipped.find(e=>EQ[e.toLowerCase()]&&EQ[e.toLowerCase()].t==='bag'&&e.toLowerCase().includes(bagQ.trim()));
        if(!myBag)return say(ws,'No matching bag equipped.','err');
        if(!p.bagContents||!p.bagContents[myBag]||!p.bagContents[myBag].length)return say(ws,'That bag is empty.','err');
        const idx=p.bagContents[myBag].findIndex(i=>i.toLowerCase().includes(itemQ.trim()));
        if(idx===-1)return say(ws,"That item isn't in that bag.",'err');
        const item=p.bagContents[myBag].splice(idx,1)[0];
        p.inventory.push(item);
        say(ws,`You take the ${item} from your ${myBag}.`,'ok');
        sidebar(ws,p);break;
      }
      // TAKE from room (existing)
      const rm2=world[p.room];if(!rm2)break;
      const ri=( rm2.items||[]).findIndex(i=>i.toLowerCase().includes(rest));
      if(ri===-1)return say(ws,`No '${rest}' here.`,'err');
      const it2=rm2.items.splice(ri,1)[0];p.inventory.push(it2);say(ws,`You pick up the ${it2}.`,'ok');sidebar(ws,p);break;
    }
    case'inventory':case'inv':case'i':{
      if(!p.inventory.length&&!p.equipped.length)return say(ws,'Empty.','sys');
      if(p.inventory.length){
        const counts={};
        p.inventory.forEach(i=>{counts[i]=(counts[i]||0)+1;});
        const stacked=Object.entries(counts).map(([name,n])=>n>1?`(${n}) ${name}`:name);
        say(ws,'Pack: '+stacked.join(', '),'sys');
      }
      if(p.equipped.length){
        say(ws,'Equipped: '+p.equipped.join(', '),'sys');
        // Show bag summaries
        p.equipped.forEach(e=>{
          const bk=EQ[e.toLowerCase()];
          if(bk&&bk.t==='bag'){
            const bc=(p.bagContents||{})[e]||[];
            say(ws,`  ${e}: ${bc.length}/${bk.slots} slots used${bc.length?' — '+bc.slice(0,3).join(', ')+(bc.length>3?'...':''):' (empty)'}  [type BAG to open]`,'sys');
          }
        });
      }
      break;
    }
    case'stats':case'score':{
      say(ws,`─── ${p.name} ── ${p.raceName||''} ${p.className} ── Level ${p.level} ───`,'sys');
      say(ws,`HP:${p.hp}/${p.maxhp}  ATK:${p.atk}(+${p.gearAtk}gear)  DEF:${p.def}(+${p.gearDef}gear)`,'sys');
      say(ws,`Gold:${p.gold}g  XP:${p.xp}/${xpToLevel(p.level)}  Kills:${p.killCount||0}`,'sys');
      if(p.companion)say(ws,`Companion: ${p.companion.name} HP:${p.companion.hp} ATK:${p.companion.atk}`,'sys');
      if(p.zombies&&p.zombies.length)say(ws,`Zombies: ${p.zombies.length} under command`,'sys');break;
    }
    case'map':showMap(ws);break;
    case'who':{
      const online=[...sessions.values()].filter(x=>x.loggedIn);
      say(ws,`─── James Village Online (${online.length}) ──────────────────`,'sys');
      online.forEach(x=>{
        const inParty=getParty(x.username)?'[Party]':'';
        const gld=x.guildId&&guilds[x.guildId]?`<${guilds[x.guildId].name}>`:'';
        const adm=x.isAdmin?'[ADMIN]':'';
        say(ws,`  ${x.inCombat?'⚔':' '} ${x.name}${adm} the ${x.raceName||''} ${x.className} Lv${x.level} ${gld}${inParty} — ${world[x.room]?.name||x.room}`,'sys');
      });break;
    }
    case'npcs':{
      const here=Object.values(NPCS).filter(n=>n.room===p.room);
      if(!here.length)return say(ws,'No NPCs here.','sys');
      here.forEach(n=>say(ws,`  ${n.name} — ${n.title} (TALK ${n.name.split(' ')[0].toLowerCase()})`, 'narrate'));break;
    }
    case'talk':case'speak':{
      if(!rest)return say(ws,'TALK [message] — speak aloud in the room. NPCs and companions may respond.','err');
      const _tw=rest.trim().split(/\s+/);
      // Single NPC name only → greeting / quest interaction
      const _npcsHereT=Object.values(NPCS).filter(n=>n.room===p.room);
      const _matchSingleNpc=_tw.length===1&&_npcsHereT.find(n=>n.name.toLowerCase().includes(_tw[0].toLowerCase()));
      if(_matchSingleNpc){
        doTalk(ws,p,_tw[0]).catch(e=>{console.error('[TALK NPC]',e.message);say(ws,'(They seem distracted right now.)','sys');});
        break;
      }
      // Broadcast to room
      say(ws,`You say: "${rest}"`,'chat');
      sayRoom(p.room,`${p.name} says: "${rest}"`,'chat',ws);
      // ── Grimwald arcade riddle ──────────────────────────────────────────────
      if(p.room==='weaponsmith'){
        const _qL=rest.toLowerCase();
        if(_qL.includes('arcade')||_qL.includes('secret')||_qL.includes('back room')||_qL.includes('door')||_qL.includes('north')){
          say(ws,"Grimwald sets his hammer down and lowers his voice. 'There's a room behind this forge no one has seen in decades. The old arcade — I kept it running all these years. But I only open it for those who know their history. Tell me: what generation kept the arcades alive in the 1980s? Just say the answer.'", 'narrate');
          p._arcadeRiddle=true;
          break;
        }
        if(p._arcadeRiddle&&(_qL.includes('gen x')||_qL.includes('generation x'))){
          say(ws,"Grimwald's face breaks into a wide grin. 'Ha! Generation X. They fed every last quarter into those machines. You know your history, friend.'", 'narrate');
          say(ws,"The iron door behind the forge grinds open with a deep mechanical clunk.", 'ok');
          say(ws,"[ The Arcade is now unlocked. Go NORTH from the Weaponsmith. ]", 'sys');
          p.arcadeUnlocked=true;
          p._arcadeRiddle=false;
          svc(p);
          break;
        }
        if(p._arcadeRiddle){
          say(ws,"Grimwald shakes his head slowly. 'That's not it. Think about who was young in the 80s — who spent all their weekends at the arcade?'", 'narrate');
          break;
        }
      }
      // ── AI NPC / companion responses ──────────────────────────────────────
      doAsk(ws,p,rest,true).catch(e=>{console.error('[TALK AI]',e.message);});
      break;
    }
    case'global':{
      // GLOBAL = server-wide broadcast
      if(!rest)return say(ws,'GLOBAL [message] — broadcast to all players on the server.','err');
      bAll({type:'line',text:`[GLOBAL] ${p.name}: ${rest}`,cls:'chat'});break;
    }
    case'ask':{
      // ASK redirects to TALK — kept for backward compatibility
      if(!rest)return say(ws,'Use TALK [message] to speak with NPCs and companions.','err');
      say(ws,'(Tip: Use TALK instead of ASK.)','sys');
      say(ws,`You say: "${rest}"`,'chat');
      sayRoom(p.room,`${p.name} says: "${rest}"`,'chat',ws);
      // ── Grimwald arcade riddle (mirrors TALK handler) ──────────────────
      if(p.room==='weaponsmith'){
        const _qL=rest.toLowerCase();
        if(_qL.includes('arcade')||_qL.includes('secret')||_qL.includes('back room')||_qL.includes('door')||_qL.includes('north')){
          say(ws,"Grimwald sets his hammer down and lowers his voice. 'There's a room behind this forge no one has seen in decades. The old arcade — I kept it running all these years. But I only open it for those who know their history. Tell me: what generation kept the arcades alive in the 1980s? Just say the answer.'", 'narrate');
          p._arcadeRiddle=true;
          break;
        }
        if(p._arcadeRiddle&&(_qL.includes('gen x')||_qL.includes('generation x'))){
          say(ws,"Grimwald's face breaks into a wide grin. 'Ha! Generation X. They fed every last quarter into those machines. You know your history, friend.'", 'narrate');
          say(ws,"The iron door behind the forge grinds open with a deep mechanical clunk.", 'ok');
          say(ws,"[ The Arcade is now unlocked. Go NORTH from the Weaponsmith. ]", 'sys');
          p.arcadeUnlocked=true; p._arcadeRiddle=false; svc(p);
          break;
        }
        if(p._arcadeRiddle){
          say(ws,"Grimwald shakes his head slowly. 'That's not it. Think about who was young in the 80s — who spent all their weekends at the arcade?'", 'narrate');
          break;
        }
      }
      // ───────────────────────────────────────────────────────────────────
      doAsk(ws,p,rest,true).catch(e=>{console.error('[ASK→TALK]',e.message);});
      break;
    }
    case'accept':{
      if(!p._pendingQ)return say(ws,'No quest to accept. TALK to an NPC first.','err');
      const qid=p._pendingQ,q=QUESTS[qid];if(!q)return;
      if(!p.quests)p.quests={};p.quests[qid]='active';p._pendingQ=null;
      say(ws,`[ Quest Accepted: ${q.title} ]`,'ok');say(ws,`Objective: ${q.obj}`,'sys');
      if(qid==='temple_blessing'){finishQuest(ws,p,qid);return;}
    // Check if it's a chain quest
    const chainDef=QUEST_CHAINS[qid];
    if(chainDef){
      if(!p.quests)p.quests={};p.quests[qid]='active';p._pendingQ=null;
      say(ws,`[ Quest Accepted: ${chainDef.title} ]`,'ok');
      say(ws,`Objective: ${chainDef.obj}`,'sys');svc(p);return;
    }
      svc(p);break;
    }
    case'quests':case'journal':case'q':{
      const qs=p.quests||{};
      const active=Object.entries(qs).filter(([,v])=>v==='active');
      const done=Object.entries(qs).filter(([,v])=>v==='done');
      say(ws,'─── Quest Log ──────────────────────────────────────','sys');
      if(!active.length&&!done.length){say(ws,'  No quests yet. Talk to NPCs in town.','sys');break;}
      if(active.length){say(ws,'  Active:','sys');active.forEach(([qid])=>{const q=QUESTS[qid];if(q)say(ws,`  ▶ ${q.title} — ${q.obj}`,'ok');});}
      if(done.length){say(ws,'  Completed:','sys');done.forEach(([qid])=>{const q=QUESTS[qid];if(q)say(ws,`  ✓ ${q.title}`,'sys');});}break;
    }
    case'farewell':case'bye':{const n=Object.values(NPCS).find(x=>x.room===p.room);if(n)say(ws,`${n.name} nods farewell.`,'narrate');break;}
    case'boot':{
      if(p.room!=='arcade_c64')return say(ws,'Nothing to boot here.','err');
      say(ws,'The datasette clicks. The BASIC screen flickers to life...','narrate');
      if(ws.readyState===WS.OPEN)ws.send(JSON.stringify({type:'c64_open'}));
      break;
    }
    case'play':{
      if(p.room==='arcade_trail'){
        say(ws,'The green phosphor screen hums. Loading Oregon Trail...','narrate');
        if(ws.readyState===WS.OPEN)ws.send(JSON.stringify({type:'trail_open'}));
        break;
      }
      if(p.room==='arcade_c64'){say(ws,'Type BOOT to access the C64.','sys');break;}
      if(p.room!=='grimwald_back')return say(ws,"There are no arcade machines here. Find Grimwald's secret back room.",'err');
      const _game=(rest||'').toLowerCase().trim();
      const _validGames={invaders:'Orc Invaders',breakout:'Dragon Battle',snake:"Dragon's Greed"};
      if(!_validGames[_game]){
        say(ws,'Three machines hum with readiness:','sys');
        say(ws,'  PLAY INVADERS  — Orc Invaders','sys');
        say(ws,'  PLAY BREAKOUT  — Dragon Battle','sys');
        say(ws,"  PLAY SNAKE     — Dragon's Greed",'sys');
        break;
      }
      say(ws,`The ${_validGames[_game]} cabinet flickers to life. Insert coin...`,'narrate');
      if(ws.readyState===WS.OPEN)ws.send(JSON.stringify({type:'arcade_open',game:_game}));
      break;
    }
    case'broadcast':{
      if(p.room!=='arcade_theater')return say(ws,'You must be in the Phantom Cinema to broadcast.','err');
      if(_theaterBroadcaster&&_theaterBroadcaster.username===p.username){
        // Stop existing broadcast
        _theaterBroadcaster=null;
        for(const[tw,tp] of sessions){if(tp.room==='arcade_theater'&&tw.readyState===WS.OPEN)tw.send(JSON.stringify({type:'theater_stream_ended'}));}
        say(ws,'Screen share stopped.','sys');
      } else if(_theaterBroadcaster){
        say(ws,`${_theaterBroadcaster.username} is already broadcasting. Wait for them to stop.`,'err');
      } else {
        raw(ws,{type:'theater_broadcast_request'});
        say(ws,'Starting screen share… allow the browser permission when prompted.','sys');
      }
      break;
    }
    case'listings':
    case'watch':{
      if(p.room!=='arcade_theater')return say(ws,"The Phantom Cinema is north of Grimwald's Back Room.",'err');
      const _tFilms=[
        {id:'bagdad24',title:'The Thief of Bagdad',           year:1924,genre:'Fantasy'},
        {id:'bagdad40',title:'The Thief of Bagdad',           year:1940,genre:'Fantasy'},
        {id:'sinbad',  title:'The Magic Voyage of Sinbad',    year:1962,genre:'Fantasy'},
        {id:'alibaba', title:'Ali Baba and the Forty Thieves',year:1944,genre:'Fantasy'},
        {id:'jason',   title:'Jason and the Argonauts',       year:1963,genre:'Fantasy'},
        {id:'wizards', title:'Wizards',                       year:1977,genre:'Fantasy'},
      ];
      const _fid=(rest||'').toLowerCase().trim();
      if(v==='watch'&&_fid){
        // Player wants a specific film
        const _fm=_tFilms.find(f=>f.id===_fid||f.title.toLowerCase().includes(_fid));
        if(!_fm)return say(ws,"That film isn't in the listing. Type LISTINGS to see what's showing.",'err');
        if(_theaterNowPlaying&&_theaterNowPlaying.filmId!==_fm.id){
          // A different film is already running — block
          const _cur=_tFilms.find(f=>f.id===_theaterNowPlaying.filmId);
          const _el=Math.floor((Date.now()-_theaterNowPlaying.startedAt)/1000);
          const _m=Math.floor(_el/60),_s=String(_el%60).padStart(2,'0');
          return say(ws,`"${_cur?_cur.title+' ('+_cur.year+')':'A film'}" is already showing (${_m}m ${_s}s in). Type WATCH to join the audience, or STOP to end it.`,'sys');
        }
        // Start (or restart) this film — broadcast to everyone in the room
        _theaterNowPlaying={filmId:_fm.id,startedAt:Date.now()};
        sayRoom('arcade_theater',`The house lights dim. "${_fm.title} (${_fm.year})" begins on the silver screen...`,'narrate');
        bRoom('arcade_theater',{type:'theater_open',id:_fm.id,elapsed:0});
      } else if(_theaterNowPlaying){
        // WATCH/LISTINGS with no args while something is playing — join at current position
        const _fm=_tFilms.find(f=>f.id===_theaterNowPlaying.filmId);
        const _el=Math.floor((Date.now()-_theaterNowPlaying.startedAt)/1000);
        const _m=Math.floor(_el/60),_s=String(_el%60).padStart(2,'0');
        say(ws,`Joining "${_fm?_fm.title+' ('+_fm.year+')':'the current film'}" — already ${_m}m ${_s}s in...`,'narrate');
        if(ws.readyState===WS.OPEN)ws.send(JSON.stringify({type:'theater_open',id:_theaterNowPlaying.filmId,elapsed:_el}));
      } else {
        // Nothing playing — show listings panel
        say(ws,'🎬 THE PHANTOM CINEMA — WHAT WOULD YOU LIKE TO SEE?','sys');
        _tFilms.forEach(f=>say(ws,`  WATCH ${f.id.padEnd(9)} — ${f.title} (${f.year})  [${f.genre}]`,'sys'));
        say(ws,"Type WATCH [id] to start a film  (e.g. WATCH jason)",'sys');
        if(ws.readyState===WS.OPEN)ws.send(JSON.stringify({type:'theater_open',id:null,elapsed:0}));
      }
      break;
    }
    case'stop':{
      if(p.room!=='arcade_theater')break;
      if(!_theaterNowPlaying)return say(ws,'No film is currently showing.','sys');
      _theaterNowPlaying=null;
      sayRoom('arcade_theater','The projector rattles to a halt. The screen goes dark.','narrate');
      bRoom('arcade_theater',{type:'theater_close'});
      break;
    }
    case'travel':{
      if(p.inCombat)return say(ws,'The Map Mole cannot open tunnels during combat!','err');
      if(p.room!=='map_shop')return say(ws,"The Map Mole is only at The Cartographer's Den (north of the Dark Alley). Visit them to travel.",'err');
      if(!rest){
        say(ws,'═══ Map Mole Express — Available Routes ═══','sys');
        let lastTier='';
        MOLE_DESTINATIONS.forEach(d=>{
          if(d.tier!==lastTier){say(ws,`  ── ${d.tier} ──`,'zone');lastTier=d.tier;}
          say(ws,`  [${String(d.n).padStart(2)}] ${d.name.padEnd(22)} ${d.price}g — ${d.desc}`,'sys');
        });
        say(ws,'  Type TRAVEL [number] to travel. The Mole handles the rest.','skill');
        break;
      }
      // Match by number or name fragment
      const _tnum=parseInt(rest,10);
      const _tdest=isNaN(_tnum)
        ? MOLE_DESTINATIONS.find(d=>d.name.toLowerCase().includes(rest.toLowerCase()))
        : MOLE_DESTINATIONS.find(d=>d.n===_tnum);
      if(!_tdest)return say(ws,`No route matching "${rest}". Type TRAVEL to see the list.`,'err');
      if(!world[_tdest.room])return say(ws,'That route is currently unavailable.','err');
      if(p.gold<_tdest.price)return say(ws,`You need ${_tdest.price}g for that route. You have ${p.gold}g.`,'err');
      p.gold-=_tdest.price;
      say(ws,`The Map Mole dives underground. The floor ripples like water — you follow.`,'narrate');
      setTimeout(()=>{
        say(ws,`The tunnel seals behind you. You emerge at ${_tdest.name}.`,'narrate');
        p.room=_tdest.room;
        describeRoom(ws,p);
        svc(p);sidebar(ws,p);
      },1200);
      break;
    }
    case'recruit':{
      if(!rest)return say(ws,'RECRUIT [name] — recruit Lyra, Fenwick, or Dusk from the tavern.','sys');
      const _advKey=Object.keys(ADVENTURERS).find(k=>ADVENTURERS[k].name.toLowerCase().includes(rest.toLowerCase())||ADVENTURERS[k].shortName.toLowerCase()===rest.toLowerCase());
      if(!_advKey)return say(ws,`No adventurer named "${rest}". Try: RECRUIT LYRA, RECRUIT FENWICK, or RECRUIT DUSK.`,'err');
      const _adv=ADVENTURERS[_advKey];
      if(_adv.room!==p.room)return say(ws,`${_adv.name} is not here. They wait at the Broken Flagon tavern.`,'err');
      if(!p.adventurers)p.adventurers=[];
      if(p.adventurers.find(a=>a.key===_advKey))return say(ws,`${_adv.name} is already adventuring with you.`,'err');
      const {atk:_aatk,maxhp:_amaxhp}=advScaledStats(p,_adv);
      p.adventurers.push({key:_advKey,name:_adv.name,atk:_aatk,hp:_amaxhp,maxhp:_amaxhp});
      say(ws,`${_adv.name} agrees to join your adventure.`,'ok');
      say(ws,`  "${_adv.joinLine}"`,'narrate');
      say(ws,`  [ATK:${_aatk} HP:${_amaxhp}/${_amaxhp}] They will fight alongside you and follow wherever you go.`,'sys');
      say(ws,`  TALK ${_adv.shortName} [message] to chat. DISMISS ${_adv.shortName} to part ways.`,'sys');
      showAdvProfile(ws,p,_advKey);
      sidebar(ws,p);break;
    }
    case'achievements':case'achieve':{
      say(ws,'─── Achievements ──────────────────────────────────','sys');
      const earned=p.achievements||[];
      ACHS.forEach(a=>{const done=earned.includes(a.id);say(ws,`  ${done?'✓':'○'} ${a.name.padEnd(20)} ${a.desc}${done&&a.reward>0?` [+${a.reward}g]`:''}`,'sys');});
      say(ws,`  Earned: ${earned.length}/${ACHS.length}`,'sys');break;
    }
    case'guild':case'g':{const pts=rest.split(' ');guildCmd(ws,p,pts[0].toLowerCase(),pts.slice(1).join(' '));break;}
    case'gc':guildCmd(ws,p,'chat',rest);break;
    case'guildhall':doGuildHall(ws,p);break;
    case'bed':doGuildBed(ws,p);break;
    case'vault':{
      const rm=world[p.room];
      if(rm&&rm.guildVault) doGuildVaultCmd(ws,p,'vault','');
      else say(ws,'No vault here. Go to your guild hall vault room.','err');
      break;
    }
    case'storage':{
      const rm=world[p.room];
      if(rm&&rm.guildStorage) doGuildStorageCmd(ws,p,'storage','');
      else say(ws,'No storage here. Go to your guild hall storage room.','err');
      break;
    }
    case'store':case'donate':{
      const rm=world[p.room];
      if(rm&&rm.guildStorage) doGuildStorageCmd(ws,p,'store',rest);
      else say(ws,'No guild storage here. Go to your guild storage room.','err');
      break;
    }
    case'retrieve':{
      const rm=world[p.room];
      if(rm&&rm.guildStorage) doGuildStorageCmd(ws,p,'retrieve',rest);
      else say(ws,'No guild storage here.','err');
      break;
    }
    case'deposit':{
      const rm=world[p.room];
      if(rm&&rm.guildVault) doGuildVaultCmd(ws,p,'deposit',rest);
      else {
        // Fall back to old deposit from anywhere
        if(!p.guildId)return say(ws,'Not in a guild.','err');
        const amt=parseInt(rest);if(isNaN(amt)||amt<1)return say(ws,'DEPOSIT [amount]','err');
        if(p.gold<amt)return say(ws,`Not enough gold.`,'err');
        p.gold-=amt;guilds[p.guildId].bank+=amt;saveGuilds();svc(p);
        say(ws,`Deposited ${amt}g. Guild bank: ${guilds[p.guildId].bank}g.`,'ok');
        say(ws,'Tip: Visit your Guild Vault room to deposit and check the balance.','sys');
      }
      break;
    }
    case'withdraw':{
      const rm=world[p.room];
      if(rm&&rm.guildVault) doGuildVaultCmd(ws,p,'withdraw',rest);
      else {
        if(!p.guildId)return say(ws,'Not in a guild.','err');
        const g=guilds[p.guildId];
        if(g.leader!==p.username)return say(ws,'Only the leader can withdraw. Use the Guild Vault room.','err');
        const amt=parseInt(rest);if(isNaN(amt)||amt<1||g.bank<amt)return say(ws,`Can't withdraw ${amt}g. Bank has ${g.bank}g.`,'err');
        g.bank-=amt;p.gold+=amt;saveGuilds();svc(p);
        say(ws,`Withdrew ${amt}g.`,'ok');
      }
      break;
    }
    case'party':case'pt':{const pts=rest.split(' ');partyCmd(ws,p,pts[0].toLowerCase(),pts.slice(1).join(' '));break;}
    case'pc':partyCmd(ws,p,'chat',rest);break;
    case'trade':tradeCmd(ws,p,rest);break;
    case'profile':showProfile(ws,p,p);break;
    case'bio':{if(!rest)return say(ws,'BIO [text]','err');p.bio=rest.slice(0,300);svc(p);say(ws,'Biography updated.','ok');break;}
    case'board':case'notices':showBoard(ws);break;
    case'leaders':case'leaderboard':case'lb':case'top':showLeaderboard(ws,rest);break;
    case'rest':{
      const inns=['tavern','ashford_inn'];
      if(!inns.includes(p.room))return say(ws,'You can only rest at a tavern inn (The Broken Flagon or The Rusted Nail).','err');
      const resting=(p.adventurers||[]).filter(a=>a.resting);
      if(!resting.length){p.hp=p.maxhp;say(ws,'You rest at the inn. HP fully restored.','ok');sidebar(ws,p);break;}
      p.hp=p.maxhp;
      resting.forEach(a=>{
        a.resting=false;a.hp=a.maxhp;
        say(ws,`${a.name} is back on their feet and ready to fight.`,'ok');
      });
      say(ws,`${resting.length} companion${resting.length>1?'s':''} revived. HP restored.`,'loot');
      sidebar(ws,p);svc(p);break;
    }
    case'reputation':case'rep':case'standing':{
      ensureRep(p);
      say(ws,'⚑ ── Your Reputation ─────────────────────────────','loot');
      Object.entries(REP_FACTIONS).forEach(([k,f])=>{
        const val=p.reputation[k]||0;const lb=repLabel(val);
        say(ws,`  ${f.name.padEnd(28)} ${lb.label.padEnd(10)} (${val>0?'+':''}${val})`,lb.cls);
      });
      say(ws,'  Earn rep by slaying monsters aligned with each faction.','sys');
      break;
    }
    case'auction':case'ah':{const pts=rest.split(' ');auctionCmd(ws,p,pts[0].toLowerCase(),pts.slice(1).join(' '));break;}
    case'housing':case'room':case'inn':{const pts=rest.split(' ');housingCmd(ws,p,pts[0]||'enter',pts.slice(1).join(' '));break;}
    case'autoloot':{
      // Support: AUTOLOOT (toggle), AUTOLOOT ON, AUTOLOOT OFF
      if(rest==='on')  p.autoloot=true;
      else if(rest==='off') p.autoloot=false;
      else p.autoloot=!p.autoloot;
      say(ws,`Auto-loot ${p.autoloot?'✓ ON — items picked up automatically after combat':'OFF — items stay on the ground'}.`,p.autoloot?'ok':'sys');
      svc(p);
      // Echo current state back to client for UI sync
      raw(ws,{type:'autoloot_state',enabled:p.autoloot});
      break;
    }
    case'alias':{
      if(!rest){
        say(ws,'Your aliases:','sys');
        const aliases=p.aliases||{};
        if(!Object.keys(aliases).length)say(ws,'  None set. ALIAS [shortcut] [command] to create one.','sys');
        else Object.entries(aliases).forEach(([k,v])=>say(ws,`  ${k} = ${v}`,'sys'));
        break;
      }
      const [aliasKey,...aliasVal]=rest.split(' ');
      if(!aliasVal.length){
        if(p.aliases&&p.aliases[aliasKey]){delete p.aliases[aliasKey];say(ws,`Alias "${aliasKey}" removed.`,'ok');}
        else say(ws,`No alias "${aliasKey}". ALIAS [shortcut] [command] to create.`,'err');
      }else{
        if(!p.aliases)p.aliases={};
        p.aliases[aliasKey.toLowerCase()]=aliasVal.join(' ');
        say(ws,`Alias set: ${aliasKey} = ${aliasVal.join(' ')}`,'ok');
      }
      svc(p);break;
    }
    case'choose':{doChooseSpec(ws,p,rest);break;}
    case'time':case'weather':{
      const tw=getTimeWeather();
      say(ws,`Time: ${tw.hour} — Weather: ${tw.weather} — ${tw.isNight?'Night (creatures stronger)':'Day'}`,  'narrate');break;
    }
    case'chat':{
      // Channel chat: CHAT GLOBAL/TRADE [message]
      const parts=rest.split(' ');const ch=parts[0].toLowerCase();const msg=parts.slice(1).join(' ');
      if(ch==='trade'&&msg){bAll({type:'line',text:`[TRADE] ${p.name}: ${msg}`,cls:'shop'});break;}
      if(ch==='global'&&msg){bAll({type:'line',text:`[GLOBAL] ${p.name}: ${msg}`,cls:'chat'});break;}
      say(ws,'CHAT GLOBAL [msg] or CHAT TRADE [msg]','sys');break;
    }
    case'post':{
      if(!rest)return say(ws,'POST [message] to pin a notice on the board.','err');
      if(rest.length>200)return say(ws,'Notice too long (max 200 chars).','err');
      addNotice(p.name,rest);break;
    }
    case'say':{if(!rest)return;say(ws,`You say: "${rest}"`,'chat');sayRoom(p.room,`${p.name} says: "${rest}"`,'chat',ws);break;}
    case'yell':case'shout':{if(!rest)return;bAll({type:'line',text:`${p.name} yells: "${rest}"`,cls:'chat'});break;}
    case'tell':case'whisper':{
      const pts=rest.split(' '),tn=pts[0],msg=pts.slice(1).join(' ');
      if(!tn||!msg)return say(ws,'tell [player] [message]','err');
      const tgt=[...sessions.values()].find(x=>x.name&&x.name.toLowerCase()===tn.toLowerCase()&&x.loggedIn);
      if(!tgt)return say(ws,`${tn} is not online.`,'err');
      say(ws,`You whisper to ${tgt.name}: "${msg}"`,'tell');say(tgt.ws,`${p.name} whispers: "${msg}"`,'tell');break;
    }
    case'explore':{
      const _ezRm=world[p.room];
      if(!_ezRm?.explore)return say(ws,'There is nothing hidden to explore here.','err');
      if(p.inCombat)return say(ws,'You cannot explore while in combat.','err');
      const _ezSurface=p.room;
      p.exploreReturn=_ezSurface;
      sayRoom(_ezSurface,`${p.name} slips into the shadows to explore.`,'narrate',ws);
      p.room=_ezRm.explore;
      say(ws,'You venture into the hidden depths…','narrate');
      describeRoom(ws,p);sidebar(ws,p);
      // Party followers enter the zone with the leader
      const _ezParty=getParty(p.username);
      if(_ezParty){
        const _ezPObj=parties.get(_ezParty.id);
        if(_ezPObj&&_ezPObj.leader===p.username){
          [..._ezPObj.members].forEach(u=>{
            if(u===p.username)return;
            const mate=[...sessions.values()].find(x=>x.username===u&&x.loggedIn);
            if(!mate||!mate.partyFollow||mate.inCombat||mate.room!==_ezSurface)return;
            mate.exploreReturn=_ezSurface;
            mate.room=_ezRm.explore;
            say(mate.ws,`[Party] You follow ${p.name} into the hidden depths…`,'narrate');
            describeRoom(mate.ws,mate);sidebar(mate.ws,mate);
          });
        }
      }
      break;
    }
    case'leave':case'exit':case'stopexploring':{
      const _lRm=world[p.room];
      if(!_lRm?.exploreZone)return say(ws,'Nothing to leave here. Use a direction to move.','err');
      if(p.inCombat)return say(ws,'You cannot leave while in combat.','err');
      const _leavingZone=p.room;
      const _retRoom=p.exploreReturn||_lRm.exploreZone;
      p.exploreReturn=null;
      sayRoom(_leavingZone,`${p.name} disappears back to the surface.`,'narrate',ws);
      p.room=_retRoom;
      say(ws,'You emerge from the hidden depths, back on the surface.','ok');
      describeRoom(ws,p);sidebar(ws,p);
      // Party followers leave the zone with the leader
      const _lvParty=getParty(p.username);
      if(_lvParty){
        const _lvPObj=parties.get(_lvParty.id);
        if(_lvPObj&&_lvPObj.leader===p.username){
          [..._lvPObj.members].forEach(u=>{
            if(u===p.username)return;
            const mate=[...sessions.values()].find(x=>x.username===u&&x.loggedIn);
            if(!mate||!mate.partyFollow||mate.inCombat)return;
            // Only pull them out if they're in the same explore zone
            if(!world[mate.room]?.exploreZone||world[mate.room].exploreZone!==_lRm.exploreZone)return;
            const mateReturn=mate.exploreReturn||_lRm.exploreZone;
            mate.exploreReturn=null;
            mate.room=mateReturn;
            say(mate.ws,`[Party] You follow ${p.name} back to the surface.`,'narrate');
            describeRoom(mate.ws,mate);sidebar(mate.ws,mate);
          });
        }
      }
      break;
    }
    case'save':svc(p);say(ws,'[ Saved. ]','sys');break;
    case'help':showHelp(ws,p);break;
    default:say(ws,`Unknown command '${v}'. Type HELP.`,'err');
  }
}

// Monster descriptions
const MOB_DESCS = {
  "Giant Rat":"A large diseased rat the size of a cat. Red eyes, matted fur, yellowed teeth. Aggressive despite its size.",
  "Timber Wolf":"A lean grey wolf with pale intelligent eyes. Moves in silence. Likely has packmates nearby.",
  "Forest Troll":"A hulking creature covered in moss and bark-like skin. Knuckles drag the ground. Surprisingly fast.",
  "Stone Golem":"An ancient construct of mossy limestone, animated by forgotten magic. Glowing orange eyes. Slow but devastating.",
  "Swamp Serpent":"A massive bog serpent, mottled brown and green, venom dripping from curved fangs. Coiled and ready.",
  "Bog Witch":"A twisted old woman of the swamp. Wild hair tangled with weeds, gnarled staff, a grin that does not mean well.",
  "Skeleton Warrior":"An animated skeleton in rusted armour, sword raised. Empty eye sockets glow with cold blue fire.",
  "Armored Skeleton":"A heavier skeleton in better-preserved plate. More imposing than its lesser kin. Moves with purpose.",
  "Risen Corpse":"A shambling undead in rotted dungeon clothing. It does not think. It only approaches.",
  "Risen Cultist":"A robed undead, cult markings still visible on decayed flesh. Fingers curled around nothing.",
  "Crypt Lich":"A minor lich in burial robes, gold crown on a skull face. Dark energy crackles between its fingers.",
  "Prison Guard Ghost":"The translucent spirit of a dungeon guard, still in partial armour, chains dragging eternally behind it.",
  "Corrupt Priest":"A former priest, now undead. Torn holy robes. The symbols of faith it once wore now burn dark on its skin.",
  "Shadow Wraith":"A barely-visible dark form. Shifting at the edges. Only the glowing eyes give it any definition.",
  "Young Dragon":"Not fully grown, but still filling the chamber. Stone-grey scales, burning amber eyes, smoke curling from its nostrils.",
  "Void Cultist":"A living cultist in dark robes covered in void symbols. Violet energy crackling between both hands.",
  "Void Archon":"Taller and more powerful than a common cultist. Partially transformed, void energy consuming part of its body.",
  "Lich's Champion":"Massive armoured undead warrior in black plate. Red rune-light pulses along its armour. The Lich trusts it absolutely.",
  "Dungeon Lich":"The Dungeon Lich sits on a throne of bones. Iron crown. Cold blue fire in hollow eye sockets. Ancient and terrible. This is what you came for.",
  "Fire Elemental":"A living column of flame shaped like a humanoid. No face, just heat and light and hunger.",
  "Lava Golem":"A hulking construct of cooled and molten rock. Orange cracks of fresh lava run across its surface.",
  "Fire Imp":"Small, red, winged, and absolutely delighted to see you. Its grin is wider than its face should allow.",
  "Rock Wyrm":"A serpentine creature of stone and magma. No legs. Burrows through solid rock as if it were water.",
  "Flame Titan":"A fusion of molten rock and pure fury, compressed into a giant form. The ground cracks beneath each step.",
  "Frost Wolf":"Larger than a Timber Wolf. White-blue fur. Breath crystallizes in the air. Ice crystals in its coat.",
  "Ice Wraith":"A ghost-like figure of ice and frozen wind. Barely visible against the snow. Very fast.",
  "Yeti":"Massive white-furred ape-like creature. Enormous, shaggy. Its eyes suggest more intelligence than you would prefer.",
  "Ice Shard Golem":"A construct made of jagged ice shards with razor edges. Each movement sends splinters flying.",
  "Frost Knight":"A human warrior in ice-encrusted armour. Serves the Frost Queen. Blade permanently frozen solid.",
  "Frost Queen":"Regal and encased in living ice. Crown of icicles. Pale blue eyes, completely emotionless. Beautiful and lethal.",
  "Wind Spirit":"Made of moving air, barely visible. It trails disturbed clouds wherever it drifts.",
  "Thunder Hawk":"An eagle with a wingspan that fills the sky. Lightning crackles through every feather.",
  "Stone Sentinel":"An ancient gargoyle-like guardian that has been floating here for centuries. It is awake now.",
  "Storm God":"Not entirely physical. Storm clouds form its body. Lightning is its blood. It has noticed you.",
  "Shadow Demon":"Pure shadow given form. Clawed hands, glowing red eyes, constantly shifting.",
  "Nightmare Hound":"A black dog with no eyes. Mouth too wide. It runs on shadow instead of ground.",
  "Banshee":"A wailing female spirit with wild hair and flowing robes. Her mouth is open in a scream that has lasted centuries.",
  "Dark Treant":"A black leafless tree that walks. Ancient, twisted, shadow pouring from cracks in its bark.",
  "Void Emperor":"A robed figure on a throne of darkness. Face hidden. Void energy consuming everything around it.",
  "Crystal Golem":"A humanoid of pure crystal. Refracts light in dazzling patterns. Razor-sharp edges everywhere.",
  "Gem Spider":"A large spider with a gemstone abdomen that catches all light. Its legs are like needles.",
  "Diamond Guardian":"A nearly transparent crystal construct. Almost invisible until it moves.",
  "Prism Titan":"A colossal crystal being that refracts all light into blinding rainbows. Looking at it is difficult.",
  "Wailing Specter":"A howling ghost in tattered noble clothing. Its face is twisted in eternal anguish.",
  "Cursed Knight":"An armoured undead in blackened plate. Its blade drains life with every cut.",
  "Chained Revenant":"An undead prisoner still wearing its chains. Dragging them as it moves toward you.",
  "Bone Horror":"Assembled from the bones of multiple creatures. Wrong proportions. Too many limbs.",
  "Death Baron":"A skeletal lord in decayed finery. Crown, throne, commanding posture. It ruled here in life and refuses to accept otherwise.",
  "Astral Shark":"A shark-like creature swimming through silver astral light instead of water.",
  "Plane Walker":"A humanoid traveller between planes, partially phased in and out of reality.",
  "Githyanki Pirate":"Tall and gaunt with silver armour and a blade that glows with planar energy.",
  "Astral Leviathan":"Impossibly large. A sea-serpent made of astral energy. It circles the vortex and has done so since before your world existed.",
  "Void Wraith":"Shadow from beyond existence. Even less defined than a Shadow Demon. Almost nothing at all.",
  "Null Horror":"An entity of pure void. Looking at it feels wrong. Reality bends around it.",
  "Void Scholar":"Robed, still reading. Half-consumed by the void it studied. Still reading.",
  "Void God":"Presence more than form. The void given terrible consciousness. You should not be here.",
  "Bandit Scout":"A lean outlaw in mismatched leather armour. Dagger in one hand, crossbow ready.",
  "Bandit Thug":"A larger meaner bandit. Scarred face, crude weapons, absolutely itching for an excuse.",
  "Bandit King":"Self-styled king in stolen finery layered over bandit armour. Overconfident grin. Dangerous.",
  "Shadow Stalker":"A predator that hunts only at night. Low to the ground, multiple dark limbs. Completely silent.",
  "Night Horror":"Something that should not exist in daylight. Formless in darkness. You catch glimpses.",
  // ── Trail / Ashford monsters ─────────────────────────────────────────────
  "Trail Wolf":"Leaner and scrappier than a Timber Wolf. Adapted to road ambushes. Travels in small packs.",
  "Trail Bandit":"A King's Road outlaw in crude leather. Knife and bad intentions.",
  "Cave Bat":"Large enough to be a nuisance. Dives erratically. The squealing alone is nearly a weapon.",
  "Large Spider":"The size of a dinner platter. Web-casting, quick, and unpleasant to look at.",
  "Highland Wolf":"Larger mountain variant of the timber wolf. Thick fur, territorial, moves in silence over rocky ground.",
  "Stone Crow":"An oversized crow with stone-hard beak and talons. Scouts for carrion — or creates some.",
  "Deserter Soldier":"A former soldier gone feral on the trail. Still has military instincts but nothing to lose.",
  "Pack Rat":"Not as harmless as it looks. Organised, fast, and prone to swarming.",
  "Giant Boar":"A massive tusked boar, shoulder-height and bad-tempered. The tusks alone could skewer armour.",
  "Forest Bandit":"Trail outlaw who knows these woods better than you do. Ambush specialist.",
  "Plague Ghoul":"A risen corpse from a plague mass grave. Slow, relentless, and carries whatever killed it.",
  "River Troll":"Squat and powerful, adapted to damp darkness beneath bridges. Regenerates if not burned.",
  "Water Serpent":"A long river serpent, mottled brown and green. Strikes from the shallows without warning.",
  "Vine Golem":"A stone construct wrapped in animated vines. The vines strangle as the stones crush.",
  "Assassin Vine":"A vine animated by foul magic. Hangs still until something warm passes beneath.",
  "Gargoyle Sentinel":"Stone sentinel that passes for masonry until it moves. Extremely fast once active.",
  "Tower Wraith":"The restless spirit of a garrison soldier. Still standing watch, still refusing to let things pass.",
  "Scarecrow Horror":"An animated scarecrow powered by minor death magic. Straw and spite.",
  "Grain Toad":"An enormous toad bloated on magical grain runoff. Toxic secretions, surprisingly aggressive.",
  "Bog Frog":"Knee-high and carnivorous. Packs of them have pulled down deer. You are bigger than a deer.",
  "Mud Lurker":"A creature of compressed mud and old bones. Almost invisible when still.",
  "Swamp Cultist":"A living cultist of the bog shrine. Voluntary immersion in the swamp has changed them somewhat.",
  "Shrine Guardian":"An animate stone idol from the sunken shrine. Moss-covered, ancient, protective.",
  "Bog Horror":"Vast creature of mud and rot. Slow but immovable. Smells like twelve years of death.",
  "Cave Spider":"Pale and fast. More legs than seems necessary. Venom, webs, and total darkness.",
  "Rock Crawler":"An armoured insectoid creature that scales vertical stone with ease.",
  "Ravine Serpent":"A serpent adapted to rocky ravine terrain. Faster than expected. Aggressive.",
  "Crystal Beetle":"A beetle with a gem-hard carapace. Difficult to damage and territorial of its crystals.",
  "Stone Leviathan":"Ancient serpentine guardian of the ravine, part stone part life. It has been here longer than the road.",
  "Barrow Wight":"A restless burial spirit with a grip of iron. Hostile to the living on principle.",
  "Grave Robber":"Someone who came to loot these barrows and didn't leave. Their remains kept the ambition.",
  "Tomb Guardian":"Animated stone figure from the barrow hall. Expressionless, implacable, thorough.",
  "Barrow Skeleton":"An armoured skeletal defender of the vault. Better equipped in death than most in life.",
  "Barrow King":"Ancient chieftain refused by death. Full burial plate, ancestral blade, centuries of fury.",
  "Bandit Cutthroat":"Fast, dirty fighter with two blades and no hesitation.",
  "Bandit Sharpshooter":"Stays back and shoots. Annoyingly accurate.",
  "Bandit Enforcer":"The biggest meanest bandit in the hideout. That's saying something.",
  "Bandit Guard":"Trail bandit on guard duty. Resents it. Takes it out on trespassers.",
  "Road Captain":"Commander of the King's Road bandit network. Military background. Calls himself untouchable.",
  "Farmstead Shade":"The ghost of a farmhand who stayed after death. Confused and territorial.",
  "Grave Pest":"A diseased burrowing creature that nests in graves. Fast and bitey.",
  "Animated Plough":"A farm tool given malicious animation. Efficient at its new purpose.",
  "Silo Rat":"Enormous grain silo rat. Well-fed and aggressive.",
  "Cave Toad":"A large cave-adapted toad, pale and venomous.",
  "Farmstead Wraith":"The powerful spirit of the original farm owner. Died badly. Blames visitors.",
  // ── Ironveil Mines ───────────────────────────────────────────────────────
  "Road Bandit":"An opportunist working the mine road. Waits for lone travellers with heavy packs.",
  "Rock Snake":"A flat, stone-coloured serpent that hunts the rock faces of the hillside. Invisible until it moves.",
  "Stone Gnome":"A compact creature of living granite that guards old quarry sites. Territorial and surprisingly strong.",
  "Iron Golem Shard":"A fragment of a larger golem, still animated by residual magic. Moves in jerking, purposeful bursts.",
  "Mine Wraith":"The spirit of a miner who died in the deep tunnels and never found the way out. Still searching.",
  "Ice Wolf":"A mountain wolf adapted for high-altitude cold. Larger than its forest cousins, white-grey coated, hunts in any weather.",
  "Mountain Bandit":"An outlaw who works the mountain pass. Hardier and better-equipped than the trail bandits below.",
  "Frost Troll":"A mountain troll with ice-hardened skin and a tolerance for cold that makes conventional tactics less effective.",
  "Snow Wraith":"A spirit formed from someone who died in a mountain storm. Cold is its element. It has no memory of being warm.",
  "Ice Golem":"An animate form of glacial ice, old enough to have developed intent. Slow, extraordinarily durable.",
  "Frost Giant":"A giant of the northern peaks, twelve feet of cold muscle and older than the settlement at its feet."
}

function showRoomProfile(ws, p, roomId){
  const rm = world[roomId||p.room];
  if(!rm) return say(ws,'Nothing to examine here.','err');
  const prof = ROOM_PROFILES[roomId||p.room];
  raw(ws,{
    type:'room_profile',
    name: rm.name,
    zone: rm.zone,
    img: prof ? resolveImg('rooms', prof.img) : null,
    desc: rm.desc,
    detail: prof ? prof.detail : null,
    atmosphere: prof ? prof.atmosphere : null,
    exits: Object.keys(rm.exits||{}).join(', '),
    items: (rm.items||[]).join(', ')||null,
    monsters: (rm.monsters||[]).filter(m=>!m.dead).map(m=>m.name).join(', ')||null,
    hasShop: !!rm.shop,
    hasTeleport: !!rm.teleport,
  });
}

function showItemProfile(ws, itemName, flags={}){
  const {isEquipped=false, isInInventory=false, isOnGround=false} = typeof flags==='boolean' ? {isEquipped:flags} : flags;
  const key = itemName.toLowerCase();
  const profile = ITEM_PROFILES[key];
  const lore = ITEM_LORE[key];
  const eq = EQ[key];
  raw(ws, {
    type: 'item_profile',
    name: itemName,
    img: (profile && profile.img) ? resolveImg('items', profile.img) : (lore && lore.img) ? resolveImg('items', lore.img) : null,
    desc: profile ? profile.desc : (eq ? eq.desc || 'A useful item.' : 'A useful crafting material or drop item.'),
    lore: lore ? lore.lore : null,
    stats: eq ? {t:eq.t, atk:eq.atk||0, def:eq.def||0, slots:eq.slots||null} : null,
    isEquippable: !!eq,
    isEquipped, isInInventory, isOnGround,
    isLegendary: !!lore
  });
}

function showMobProfile(ws, mob){
  const portrait = MOB_PORTRAITS[mob.name];
  const desc = MOB_DESCS[mob.name] || 'A dangerous creature lurking in the shadows.';
  const base = portrait ? portrait.replace(/\.(jpg|jpeg|png)$/i,'') : null;
  raw(ws,{
    type:'mob_profile',
    name:mob.name,
    hp:mob.hp, maxhp:mob.maxhp,
    atk:mob.atk, def:mob.def,
    xp:mob.xp, gold:mob.gold,
    desc:desc,
    img: base ? resolveImg('monsters',base) : null
  });
}

function showAdvProfile(ws,p,advKey){
  const adv=ADVENTURERS[advKey];if(!adv)return;
  const recruited=(p.adventurers||[]).find(a=>a.key===advKey);
  const statsLine=recruited?`\n\n⚔ ATK:${recruited.atk}  ❤ HP:${recruited.hp}/${recruited.maxhp}`:'';
  raw(ws,{
    type:'npc_profile',
    name:adv.name,
    title:adv.title||'Adventurer',
    desc:(adv.desc||'')+statsLine,
    portrait:adv.portrait||'keeper',
    portraitImg:adv.portraitFile?resolveImg('npcs',adv.portraitFile):null,
    greeting:adv.greeting||'',
    room:recruited?'Adventuring with you':(world[adv.room]?.name||adv.room),
    hasQuests:false
  });
}

function showNPCProfile(ws,npc){
  const npcKey=Object.keys(NPCS).find(k=>NPCS[k]===npc)||'';
  const hasChainQ=Object.values(QUEST_CHAINS||{}).some(q=>q.giver===npcKey);
  const hasBaseQ=Object.values(QUESTS).some(q=>q.giver===npcKey);
  raw(ws,{
    type:'npc_profile',
    name:npc.name,
    title:npc.title||'',
    desc:npc.desc||'',
    portrait:npc.portrait||'',
    portraitImg:npc.portraitFile?resolveImg('npcs',npc.portraitFile):null,
    greeting:npc.greeting||'',
    room:world[npc.room]?.name||npc.room,
    hasQuests:hasBaseQ||hasChainQ
  });
}

function showCompanionProfile(ws, comp, ownerName){
  const slug=COMPANION_PORTRAITS[comp.name];
  const img=slug?resolveImg('pets',slug):null;
  raw(ws,{
    type:'npc_profile',
    name:comp.name,
    title:'Animal Companion',
    desc:`Loyal companion of ${ownerName}.\n\n⚔ ATK: ${comp.atk}  ❤ HP: ${comp.hp}/${comp.maxhp}`,
    portrait:null,
    portraitImg:img,
    greeting:'',
    room:'Adventuring with '+ownerName,
    hasQuests:false
  });
}
function showZombieProfile(ws, zombie, ownerName){
  raw(ws,{
    type:'npc_profile',
    name:zombie.name,
    title:'Undead Minion',
    desc:`Raised by ${ownerName}.\n\n⚔ ATK: ${zombie.atk}  ❤ HP: ${zombie.hp}/${zombie.maxhp}\n\nThis shambling corpse follows its master's commands without question.`,
    portrait:null,
    portraitImg:null,
    greeting:'',
    room:'Serving '+ownerName,
    hasQuests:false
  });
}

function showProfile(ws,viewer,target){
  const tGuild=target.guildId?guilds[target.guildId]:null;
  raw(ws,{type:'profile',name:target.name,raceName:target.raceName||'Unknown',className:target.className||'Unknown',
    level:target.level,hp:target.hp,maxhp:target.maxhp,atk:target.atk,def:target.def,
    gold:viewer.username===target.username?target.gold:null,xp:target.xp,xpNext:xpToLevel(target.level),
    bio:target.bio||'',avatar:target.avatar||'',equipped:target.equipped||[],
    companion:target.companion?target.companion.name:null,zombieCount:(target.zombies||[]).length,
    guildName:tGuild?tGuild.name:null,
    isSelf:viewer.username===target.username});
}

function showMap(ws){
  say(ws,'======= SHADOWMERE WORLD MAP =================','sep');
  say(ws,'TOWN: Guild District[N of Temple]-Temple-Town Square[SHRINE up]-Tavern-Apothecary','zone');
  say(ws,'      Market St[PET STORE<]-Weaponsmith | Alley-Shadow Broker','sys');
  say(ws,'      South Gate -> Ashwood Forest / down Dungeon Entrance','sys');
  say(ws,'FOREST: Ashwood Edge->Deep[->EAST Ashford Village]->Swamp Border->Heart | Edge->Camp | Deep->Ruins','zone');
  say(ws,'ASHFORD: Square->Store(W) Store(E) Healer(N) Gate(S) Outskirts->Bandit Camp','zone');
  say(ws,'DUNGEON: Entrance->Hall->Crypts->Vault | Hall->Prison | Hall->Well','zone');
  say(ws,'         Hall->Armory->Mid | Temple->Temple Crypt->Mid','sys');
  say(ws,'         Mid->Dragon Lair | Mid->Void Temple | Mid->Antechamber->LICH BOSS','sys');
  say(ws,'ADVENTURE ZONES — James Village Shrine (UP at Town Square, TELEPORT [1-8]):','zone');
  Object.entries(TELEPORT_ZONES).forEach(([k,z])=>say(ws,`  [${k}] ${z.name.padEnd(24)} Lv${z.lvl}+ — Boss: ${z.boss}`,'sys'));
  say(ws,"FRONTIER ZONES — Wayfarer's Shrine (UP at Ashford Square, TELEPORT [A-F]):",'zone');
  Object.entries(TELEPORT_ZONES_2).forEach(([k,z])=>say(ws,`  [${k}] ${z.name.padEnd(24)} Lv${z.lvl}+ — Boss: ${z.boss}`,'sys'));
  say(ws,'==============================================','sep');
}

function showHelp(ws,p){
  say(ws,'--- Commands ------------------------------------','sys');
  say(ws,'n/s/e/w/up/down/out   Move','sys');
  say(ws,'look [player/item]    Look around, examine item, or view profile','sys');
  say(ws,'take/drop [item]      Pick up or drop','sys');
  say(ws,'use/equip/unequip     Use consumable or manage gear','sys');
  say(ws,'attack / flee         Combat','sys');
  say(ws,'skill [name] / skills Use or list class skills','sys');
  say(ws,'shop / buy / sell     Shopping','sys');
  say(ws,'recipes / craft       View and craft items at smith/apothecary','sys');
  say(ws,'shrine / teleport     Adventure zone travel','sys');
  say(ws,'tame / dismiss        Tame or release animal companion','sys');
  say(ws,'companion / zombies   Check companion or zombie status','sys');
  say(ws,'talk [message]        Speak aloud to everyone in your room','sys');
  say(ws,'ask [npc]             Interact with an NPC (greeting, quests)','sys');
  say(ws,'ask [question]        Ask an NPC anything (AI-powered)','sys');
  say(ws,'global [message]      Broadcast to all players on the server','sys');
  say(ws,'accept                Accept a quest from an NPC','sys');
  say(ws,'quests / achievements  View quest log or achievements','sys');
  say(ws,'party invite/join/leave/follow/info/chat (pc)','sys');
  say(ws,'guild create/join/leave/info/list/chat (gc)/deposit/withdraw/motd','sys');
  say(ws,'guildhall             Enter your guild hall','sys');
  say(ws,'trade [player]        Open a trade session','sys');
  say(ws,'trade offer [item/g]  Add to trade offer','sys');
  say(ws,'trade confirm/cancel  Complete or cancel trade','sys');
  say(ws,'inventory / stats     Character info','sys');
  say(ws,'profile / bio [text]  View or set character profile','sys');
  say(ws,'who / map / save      Online players / map / save','sys');
  say(ws,'say / talk            Room chat (speak to players nearby)','sys');
  say(ws,'global [msg]          Broadcast to all players on server','sys');
  say(ws,'yell / tell / chat    Shout to all, whisper to player, channel chat','sys');
  say(ws,'--- Economy ------------------------------------','sys');
  say(ws,'auction list             Browse auction listings','sys');
  say(ws,'auction sell [item] [g]  List item for sale','sys');
  say(ws,'auction buy [#]          Purchase a listing','sys');
  say(ws,'auction cancel [#]       Remove your listing','sys');
  say(ws,'--- World --------------------------------------','sys');
  say(ws,'time / weather           Current time and weather','sys');
  say(ws,'leaders [level/kills/gold] View leaderboards','sys');
  say(ws,'housing rent/enter       Rent a room at an inn (50g)','sys');
  say(ws,'housing store/retrieve   Manage room storage','sys');
  say(ws,'--- Quality of Life ----------------------------','sys');
  say(ws,'autoloot                 Toggle auto item pickup','sys');
  say(ws,'alias [key] [command]    Set command shortcuts','sys');
  say(ws,'alias                    View your aliases','sys');
  say(ws,'choose [#]               Choose specialization skill','sys');
  if(p){const cls=CLASSES[p.classId];if(cls)say(ws,`Skills: ${(cls.skills||[]).map(s=>SK[s]?.n||s).join(', ')}`,'skill');}
}


// ── Auth flow ─────────────────────────────────────────────────────────────
function handleAuth(ws,sess,inputMsg){
  try{
  const msg=inputMsg.trim();
  switch(sess.state){
    case'WELCOME':
      if(msg.toLowerCase()==='login'){sess.state='LOGIN_USER';say(ws,'Username:','sys');}
      else if(msg.toLowerCase()==='register'){sess.state='REG_USER';say(ws,'Choose a username (3-20 letters/numbers):','sys');}
      else say(ws,'Type LOGIN or REGISTER.','sys');
      break;
    case'LOGIN_USER':
      sess.user=msg.toLowerCase().replace(/[^a-z0-9]/g,'');
      if(!sess.user)return say(ws,'Invalid username.','err');
      sess.state='LOGIN_PASS';say(ws,'Password:','sys');break;
    case'LOGIN_PASS':{
      if(!cex(sess.user)){sess.state='WELCOME';return say(ws,'No account found. Type REGISTER.','err');}
      const data=ldc(sess.user);
      if(!data||data.passwordHash!==hash(msg)){sess.state='WELCOME';return say(ws,'Wrong password.','err');}
      if([...sessions.values()].find(s=>s.username===sess.user&&s.loggedIn)){sess.state='WELCOME';return say(ws,'Already logged in elsewhere.','err');}
      const p=hydrate(data);p.ws=ws;p.loggedIn=true;
      // Validate saved room — if it doesn't exist, send to town square
      if(!world[p.room]){
        console.log('[LOGIN] Invalid room "'+p.room+'" for '+p.username+', resetting to town_square');
        p.room='town_square';
      }
      sessions.set(ws,p);
      say(ws,`Welcome back, ${p.name} the ${p.raceName||''} ${p.className}!`,'ok');
      bAll({type:'line',text:`${p.name} the ${p.raceName||''} ${p.className} has entered James Village.`,cls:'narrate'});
      // Restore saved avatar to client
      if(p.avatar){raw(ws,{type:'avatar_saved',avatar:p.avatar});}
      // Sync autoloot state to client options panel
      raw(ws,{type:'autoloot_state',enabled:!!p.autoloot});
      try{describeRoom(ws,p);}catch(e){console.error('[DESCRIBE ERROR]',e.message);}
      try{sidebar(ws,p);}catch(e){console.error('[SIDEBAR ERROR]',e.message);}
      break;
    }
    case'REG_USER':
      sess.user=msg.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,20);
      if(sess.user.length<3)return say(ws,'Min 3 characters.','err');
      if(cex(sess.user))return say(ws,'Username taken. Try another.','err');
      sess.state='REG_PASS';say(ws,'Choose a password (min 4 chars):','sys');break;
    case'REG_PASS':
      if(msg.length<4)return say(ws,'Min 4 characters.','err');
      sess.pass=msg;sess.state='REG_NAME';say(ws,'Your character name (visible to others):','sys');break;
    case'REG_NAME':
      console.log('[REG] Name received:',msg);
      sess.charName=msg.replace(/[^a-zA-Z ]/g,'').trim().slice(0,20);
      if(sess.charName.length<2)return say(ws,'Name too short.','err');
      sess.state='REG_RACE';
      console.log('[REG] Sending pick_race, races count:',Object.keys(RACES).length);
      try{
        const raceData=Object.entries(RACES).map(([id,r])=>({id,name:r.name,bonus:r.bonus,hp:r.hp,atk:r.atk,def:r.def,gold:r.gold}));
        console.log('[REG] Race data built OK, sending...');
        raw(ws,{type:'pick_race',races:raceData});
        console.log('[REG] pick_race sent OK');
      }catch(re){console.error('[REG] pick_race FAILED:',re.message,re.stack);}
      break;
    case'REG_RACE':{
      console.log('[REG] Race received:',msg);
      const rid=msg.toLowerCase().trim();
      if(!RACES[rid])return say(ws,`Invalid race. Options: ${Object.keys(RACES).join(', ')}`, 'err');
      sess.raceId=rid;sess.state='REG_CLASS';
      raw(ws,{type:'pick_class',classes:Object.entries(CLASSES).map(([id,c])=>({id,name:c.name,role:c.role,hp:c.hp,atk:c.atk,def:c.def,skills:(c.skills||[]).slice(0,3).map(s=>SK[s]?.n||s)}))});
      break;
    }
    case'REG_CLASS':{
      console.log('[REG] Class received:',msg);
      const cid=msg.toLowerCase().trim().replace(/\s+/g,'');
      const key=Object.keys(CLASSES).find(k=>k===cid||CLASSES[k].name.toLowerCase().replace(/\s+/g,'')===cid);
      if(!key)return say(ws,`Invalid class. Options: ${Object.keys(CLASSES).join(', ')}`,'err');
      const p=newPlayer(sess.user,sess.pass,sess.charName,sess.raceId,key);
      p.ws=ws;p.loggedIn=true;
      // Ensure data dirs exist before saving
      try{
        if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});
        if(!fs.existsSync(CHAR_DIR))fs.mkdirSync(CHAR_DIR,{recursive:true});
        svc(p);
      }catch(saveErr){
        console.error('[SAVE FAIL]',saveErr.message);
        // Continue anyway - player can play, just won't persist
      }
      sessions.set(ws,p);
      say(ws,`Welcome to James Village, ${p.name} the ${p.raceName} ${p.className}!`,'ok');
      say(ws,`Race bonus: ${RACES[sess.raceId].bonus}`,'narrate');
      say(ws,'The Dungeon Lich has risen. The land needs a hero.','narrate');
      bAll({type:'line',text:`${p.name} the ${p.raceName} ${p.className} joins James Village for the first time!`,cls:'loot'});
      raw(ws,{type:'autoloot_state',enabled:!!p.autoloot});
      describeRoom(ws,p);sidebar(ws,p);break;
    }
  }
  }catch(e){
    console.error('[AUTH ERROR]',e.message,e.stack);
    try{say(ws,'Registration error. Please refresh and try again.','err');}catch(e2){}
  }
}

// ── HTTP + WebSocket server ───────────────────────────────────────────────
const server=http.createServer((req,res)=>{
  // Health check for Render
  if(req.url==='/health'){res.writeHead(200);res.end('OK');return;}
  // Serve monster/npc images
  if(req.url.startsWith('/monsters/')||req.url.startsWith('/npcs/')||req.url.startsWith('/items/')||req.url.startsWith('/rooms/')||req.url.startsWith('/pets/')||req.url.startsWith('/Tiles/')||req.url.match(/\.(jpg|jpeg|png)$/i)){
    const imgPath=path.join(__dirname,'public',req.url.split('?')[0]);
    const ext=(req.url.split('?')[0]).split('.').pop().toLowerCase();
    const mime=ext==='png'?'image/png':'image/jpeg';
    fs.readFile(imgPath,(err,data)=>{
      if(err){res.writeHead(404);res.end('Not found');}
      else{res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache'});res.end(data);}
    });
    return;
  }
  // Serve client.html for all non-asset requests
  const isAsset = req.url.match(/\.(js|css|png|ico)$/);
  const fp = isAsset
    ? path.join(__dirname,'public',path.basename(req.url))
    : path.join(__dirname,'public','client.html');
  const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript'}[path.extname(fp)]||'text/html';
  fs.readFile(fp,(err,data)=>{
    if(err){
      // If client.html missing, check one level up
      const alt=path.join(__dirname,'client.html');
      fs.readFile(alt,(e2,d2)=>{
        if(e2){res.writeHead(404);res.end('Not found: '+fp);}
        else{res.writeHead(200,{'Content-Type':'text/html'});res.end(d2);}
      });
    }else{res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache, no-store, must-revalidate','Pragma':'no-cache','Expires':'0'});res.end(data);}
  });
});

const wss=new WS.Server({server});
wss.on('connection',ws=>{
  const sess={state:'WELCOME',user:'',pass:'',charName:'',raceId:''};
  sessions.set(ws,sess);
  const online=[...sessions.values()].filter(s=>s.loggedIn).length;
  say(ws,'╔════════════════════════════════════════════════════╗','sep');
  say(ws,'║      S H A D O W M E R E   M U D                 ║','sep');
  say(ws,'║  20 Classes · 15 Races · Guilds · Quests · NPCs  ║','sep');
  say(ws,'╚════════════════════════════════════════════════════╝','sep');
  say(ws,`${online} player(s) online.  Type LOGIN or REGISTER.`,'sys');
  ws.on('message',data=>{
    try{
      let raw2;try{raw2=data.toString().trim();}catch{return;}
      const p=sessions.get(ws);if(!p)return;
      if(!p.loggedIn){handleAuth(ws,p,raw2);return;}
      // Handle JSON messages (avatar etc) without routing to handleCmd
      if(raw2.startsWith('{')){
        try{
          const action=JSON.parse(raw2);
          if(action.type==='set_avatar'){
            if(action.data&&action.data.length<2200000){p.avatar=action.data;svc(p);raw(ws,{type:'avatar_saved',avatar:action.data});sendRoomOccupants(p.room);}
            else say(ws,'Image too large.','err');
          }else if(action.type==='clear_avatar'){
            p.avatar='';svc(p);raw(ws,{type:'avatar_saved',avatar:''});sendRoomOccupants(p.room);
          }else if(action.type==='arcade_score'){
            // Award XP for arcade performance
            const _arcScore=Math.max(0,parseInt(action.score)||0);
            const _arcXP=Math.floor(_arcScore/10);
            if(_arcXP>0){ p.xp+=_arcXP; levelUp(ws,p); svc(p); sidebar(ws,p); }
            if(action.won&&action.game==='invaders'){
              say(ws,`🕹 All orcs vanquished! Score: ${_arcScore} → +${_arcXP} XP.`,'loot');
              if(!p.achievements)p.achievements=[];
              if(!p.achievements.includes('orc_invaders'))p.achievements.push('orc_invaders');
            } else if(_arcScore>0){
              say(ws,`🕹 Arcade score: ${_arcScore} → +${_arcXP} XP.`,'ok');
            }
            svc(p);
          }else if(action.type==='trail_result'){
            if(action.completed){
              const _reward=100;
              p.gold+=_reward;sidebar(ws,p);
              say(ws,`🌲 You reached Oregon! Your land grant reward: ${_reward}g.`,'loot');
              if(!p.achievements)p.achievements=[];
              if(!p.achievements.includes('oregon_trail'))p.achievements.push('oregon_trail');
            }else{
              say(ws,'The trail claimed your party. Better luck next time.','narrate');
            }
            svc(p);
          }else if(action.type==='admin_upload'){
            if(!p.isAdmin)return say(ws,'Not authorized.','err');
            const folders={tile:'Tiles',npc:'npcs',monster:'monsters',room:'rooms',item:'items'};
            const folder=folders[action.imgType];
            if(!folder||!action.filename||!action.data||!action.ext)return say(ws,'Bad upload params.','err');
            const safeFile=action.filename.replace(/[^a-zA-Z0-9_\-]/g,'')+'.'+(action.ext||'jpg').replace(/[^a-z]/g,'');
            const savePath=path.join(__dirname,'public',folder,safeFile);
            try{
              fs.writeFileSync(savePath,Buffer.from(action.data,'base64'));
              raw(ws,{type:'admin_result',ok:true,msg:`✓ Saved ${safeFile} → public/${folder}/`});
              console.log('[ADMIN UPLOAD]',p.name,'→',savePath);
            }catch(e){raw(ws,{type:'admin_result',ok:false,msg:'Save failed: '+e.message});}
          }else if(action.type==='admin_setdesc'){
            if(!p.isAdmin)return say(ws,'Not authorized.','err');
            if(action.target==='room'){
              const rm=world[action.id];if(!rm)return say(ws,'Room not found: '+action.id,'err');
              const upd={};
              if(action.desc!==undefined){rm.desc=action.desc;upd.desc=action.desc;}
              if(action.detail!==undefined){if(!ROOM_PROFILES[action.id])ROOM_PROFILES[action.id]={};ROOM_PROFILES[action.id].detail=action.detail;upd.detail=action.detail;}
              if(action.img!==undefined){if(!ROOM_PROFILES[action.id])ROOM_PROFILES[action.id]={};ROOM_PROFILES[action.id].img=action.img;upd.img=action.img;}
              saveAdminOverrides('rooms',action.id,upd);
              raw(ws,{type:'admin_result',ok:true,msg:`✓ Room "${rm.name}" updated.`});
              sendRoomVisual(ws,p);
            }else if(action.target==='npc'){
              const npc=NPCS[action.id];if(!npc)return say(ws,'NPC not found: '+action.id,'err');
              const upd={};
              if(action.desc!==undefined){npc.desc=action.desc;upd.desc=action.desc;}
              if(action.greeting!==undefined){npc.greeting=action.greeting;upd.greeting=action.greeting;}
              saveAdminOverrides('npcs',action.id,upd);
              raw(ws,{type:'admin_result',ok:true,msg:`✓ NPC "${npc.name}" updated.`});
              sendRoomVisual(ws,p);
            }
          }else if(action.type==='wonder_cmd'){
            if(!p.isAdmin)return say(ws,'Not authorized.','err');
            const act=action.action||'';
            console.log('[Wonder CMD]',p.name,'→',act);
            if(act==='status'){
              raw(ws, wonderStatusData());
              // Text fallback — visible in game output even if JSON panel has issues
              say(ws,`✦ Wonder: ${_WND.paused?'⏸ PAUSED':'▶ ACTIVE'} | Location: ${world[_WND.room]?.name||_WND.room} | Queue: ${_WND.queue.length} | Generated: ${_WND.stats.generated} | Scanned: ${_WND.stats.roomsScanned}`,'sys');
            }else if(act==='pause'){
              _WND.paused=true;
              wonderPush('⏸ Wonder paused by admin.','warn');
            }else if(act==='resume'){
              _WND.paused=false;
              if(_WND.queue.length&&!_WND.busy)wonderProcessQueue();
              wonderPush('▶ Wonder resumed by admin.','ok');
            }else if(act==='clear'){
              const n=_WND.queue.length;_WND.queue=[];_WND.busy=false;
              wonderPush(`Queue cleared — ${n} task(s) removed.`,'warn');
            }else if(act==='scan'){
              const rid=action.roomId||p.room;
              if(world[rid]){
                const b=_WND.queue.length;wonderScanRoom(rid);
                const added=_WND.queue.length-b;
                wonderPush(`Scanned "${world[rid].name}" — ${added} task(s) added.`,added?'ok':'sys');
                if(added&&!_WND.busy&&!_WND.paused)wonderProcessQueue();
              } else wonderPush('Room not found: '+rid,'err');
            }else if(act==='scanall'){
              const b=_WND.queue.length;
              Object.keys(world).forEach(id=>wonderScanRoom(id));
              const added=_WND.queue.length-b;
              wonderPush(`Full world scan — ${added} task(s) added to queue.`,added?'ok':'sys');
              if(added){ _WND.fullScanDone=false; _WND.ideaMode=false; }
              else _WND.fullScanDone=true;
              if(added&&!_WND.busy&&!_WND.paused)wonderProcessQueue();
            }else if(act==='teleport'){
              const dest=_WND.room;
              if(!world[dest]){
                say(ws,`Wonder's location is invalid: ${dest}`,'err');
              } else {
                p.room=dest;p.inCombat=false;p.enemy=null;
                say(ws,`✦ Teleported to Wonder at ${world[dest].name}.`,'ok');
                describeRoom(ws,p);sidebar(ws,p);svc(p);
                wonderPush(`${p.name} teleported to Wonder at ${world[dest].name}.`,'sys');
              }
            }else if(act==='links'){
              let found=0;
              Object.entries(world).forEach(([id,rm])=>{
                Object.entries(rm.exits||{}).forEach(([dir,dest])=>{
                  if(!world[dest]){
                    found++;
                    wonderPush(`⚠ ${id} → ${dir} → "${dest}" (missing)`,'err');
                  }
                });
              });
              _WND.stats.brokenLinks+=found;
              wonderPush(`Links audit complete — ${found} broken exit(s).`,found?'err':'ok');
            }else if(act==='idea_approve'){
              const idea=_WND.ideas.find(i=>i.id===action.ideaId);
              if(!idea) return wonderPush('Idea not found.','err');
              if(idea.status!=='pending') return wonderPush('Idea is not pending.','err');
              idea.status='building';
              wonderPush(`✦ Admin approved "${idea.title}" — Wonder is building it now!`,'ok',{ideas:_WND.ideas.slice(0,10).map(ideaSummary)});
              setTimeout(()=>wonderBuildArea(idea), 500);
            }else if(act==='idea_reject'){
              const idea=_WND.ideas.find(i=>i.id===action.ideaId);
              if(!idea) return wonderPush('Idea not found.','err');
              idea.status='rejected';
              wonderPush(`Idea "${idea.title}" rejected.`,'sys',{ideas:_WND.ideas.slice(0,10).map(ideaSummary)});
            }else if(act==='generate_idea'){
              wonderGenerateIdea().catch(e=>console.log('[Wonder] Idea error:',e.message));
              wonderPush('✦ Wonder is dreaming up a new area…','sys');
            }
            // Always send fresh status after any action
            raw(ws, wonderStatusData());
          }else if(action.type==='admin_map_action'){
            if(!p.isAdmin)return say(ws,'Not authorized.','err');
            const sub=action.action;
            if(sub==='create_room'){
              const name=(action.name||'').trim();
              if(!name)return say(ws,'Room name required.','err');
              const rid=name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')+'_'+Date.now().toString(36);
              world[rid]={name,desc:action.desc||`A place called ${name}.`,zone:action.zone||'Unknown',exits:{},monsters:[],_dynamic:true};
              WT[rid]={mon:[],base:[]};
              // Auto-link to adjacent rooms provided by client
              if(Array.isArray(action.adjRooms)){
                action.adjRooms.forEach(adj=>{
                  if(world[adj.roomId]){
                    world[rid].exits[adj.dirFromNew]=adj.roomId;
                    world[adj.roomId].exits[adj.dirToNew]=rid;
                  }
                });
              }
              saveDynamic();
              _WND.roomList=Object.keys(world).filter(id=>id!=='wonder_limbo');
              say(ws,`✓ Room "${name}" created [${rid}].`,'ok');
              sidebar(ws,p);
              raw(ws,{type:'room_created',roomId:rid,name,gridX:action.gridX||0,gridY:action.gridY||0});
            }else if(sub==='link_rooms'){
              const{roomA,roomB,dirAtoB,dirBtoA}=action;
              if(!world[roomA]||!world[roomB])return say(ws,'Room not found.','err');
              world[roomA].exits[dirAtoB]=roomB;
              if(dirBtoA)world[roomB].exits[dirBtoA]=roomA;
              if(world[roomA]._dynamic||world[roomB]._dynamic)saveDynamic();
              say(ws,`✓ Linked "${world[roomA].name}" ↔ "${world[roomB].name}".`,'ok');
              sidebar(ws,p);
            }else if(sub==='remove_exit'){
              const rm=world[action.roomId];
              if(!rm)return say(ws,'Room not found.','err');
              delete rm.exits[action.direction];
              if(rm._dynamic)saveDynamic();
              say(ws,`Exit "${action.direction}" removed from "${rm.name}".`,'ok');
              raw(ws,{type:'room_inspect_data',roomId:action.roomId,name:rm.name,desc:rm.desc,zone:rm.zone,exits:rm.exits||{},dynamic:!!rm._dynamic});
            }else if(sub==='edit_room'){
              const rm=world[action.roomId];
              if(!rm)return say(ws,'Room not found.','err');
              if(action.name)rm.name=action.name;
              if(action.desc)rm.desc=action.desc;
              if(action.zone)rm.zone=action.zone;
              if(rm._dynamic)saveDynamic();
              say(ws,`✓ Room "${rm.name}" updated.`,'ok');
              sidebar(ws,p);
            }else if(sub==='inspect'){
              const rm=world[action.roomId]||{};
              raw(ws,{type:'room_inspect_data',roomId:action.roomId,name:rm.name||action.roomId,desc:rm.desc||'',zone:rm.zone||'',exits:rm.exits||{},dynamic:!!rm._dynamic});
            }else if(sub==='generate_idea'){
              wonderGenerateIdea().catch(e=>console.log('[Wonder] Idea error:',e.message));
              say(ws,'✦ Wonder is designing a new area…','ok');
            }
          }else if(action.type==='create_explore_zone'){
            if(!p.isAdmin){say(ws,'Not authorized.','err');return;}
            const{tileId,roomCount,zoneType}=action;
            const tile=world[tileId];
            if(!tile){raw(ws,{type:'explore_zone_result',ok:false,msg:'Tile not found: '+tileId});return;}
            if(tile.explore){raw(ws,{type:'explore_zone_result',ok:false,msg:`${tile.name} already has an explore zone (entry: ${tile.explore}).`});return;}
            const apiKey=process.env.ANTHROPIC_API_KEY;
            if(!apiKey){raw(ws,{type:'explore_zone_result',ok:false,msg:'No ANTHROPIC_API_KEY configured.'});return;}
            const prefix=tileId+'_ez';
            const tileCtx=`Surface tile: "${tile.name}" in zone "${tile.zone||'Unknown'}". Desc: "${tile.desc||'no description'}". Surface exits: ${Object.keys(tile.exits||{}).join(', ')||'none'}.`;
            const existingMons=wonderCollectExistingMonsters().slice(0,30).map(m=>`"${m.name}" (hp:${m.hp} atk:${m.atk} def:${m.def} xp:${m.xp})`).join(', ');
            say(ws,`✦ Wonder is designing a ${roomCount}-room ${zoneType} zone for ${tile.name}…`,'ok');
            (async()=>{try{
              const res=await fetch('https://api.anthropic.com/v1/messages',{
                method:'POST',
                headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
                body:JSON.stringify({model:'claude-opus-4-5',max_tokens:6000,
                  system:`You are a creative dungeon designer for "Adams World," a dark fantasy MUD. Design an explore zone — a hidden sub-area discoverable beneath or beside a surface tile. Return ONLY valid JSON with no markdown, no commentary, no text outside the JSON object.`,
                  messages:[{role:'user',content:`Design a ${zoneType} explore zone attached to tile "${tile.name}".

SURFACE CONTEXT:
${tileCtx}

REQUIREMENTS:
- Exactly ${roomCount} rooms
- Type: ${zoneType}
- All room IDs MUST start with "${prefix}_" (e.g. "${prefix}_entry", "${prefix}_cavern")
- First room in array is the entry point where the player arrives from the surface
- Rooms connect via north/south/east/west exits only
- Every room must be reachable from the first room — no dead-ends with no connecting exits
- Atmosphere should feel like a hidden world beneath/beside the surface tile
- Make it creative, atmospheric, and thematically consistent with the tile's environment

EXISTING MONSTERS (you can reuse by name):
${existingMons||'(none — create all new)'}

Return this exact JSON structure (no extra text):
{
  "zoneName": "Display name of this explore zone",
  "lore": "2-3 sentences of backstory for this hidden area.",
  "rooms": [
    {"id":"${prefix}_entry","name":"Room Name","desc":"2-3 sentence atmospheric description.","exits":{"north":"${prefix}_room2"}}
  ],
  "monsters": [
    {"name":"Monster Name","hp":40,"atk":8,"def":4,"xp":30,"gold":10,"rooms":["${prefix}_entry","${prefix}_room2"]}
  ],
  "items": [
    {"name":"Unique Item Name","type":"weapon","atk":10,"def":0,"desc":"Flavor text.","foundIn":"${prefix}_room2"}
  ]
}`}]})
              });
              if(!res.ok)throw new Error('API '+res.status);
              const apiData=await res.json();
              const rawText=apiData.content[0].text.trim();
              const jsonStart=rawText.indexOf('{'),jsonEnd=rawText.lastIndexOf('}');
              const zone=JSON.parse(jsonStart>=0?rawText.slice(jsonStart,jsonEnd+1):rawText);
              raw(ws,{type:'explore_zone_result',ok:true,zone,tileId});
              say(ws,`✦ Zone "${zone.zoneName}" designed! Review and confirm in the Explore Zones tab.`,'ok');
            }catch(e){
              console.error('[ExploreZone] Gen error:',e.message);
              raw(ws,{type:'explore_zone_result',ok:false,msg:'Generation failed: '+e.message});
            }})().catch(e=>{console.error('[ExploreZone]',e.message);raw(ws,{type:'explore_zone_result',ok:false,msg:e.message});});
          }else if(action.type==='save_explore_zone'){
            if(!p.isAdmin)return say(ws,'Not authorized.','err');
            const{tileId,zone}=action;
            const tile=world[tileId];
            if(!tile)return say(ws,'Tile not found.','err');
            // Build and register rooms
            const newRooms={};
            (zone.rooms||[]).forEach(rm=>{
              newRooms[rm.id]={name:rm.name,desc:rm.desc||'',zone:zone.zoneName,exits:rm.exits||{},exploreZone:tileId,monsters:[],items:[],_ezZone:true};
            });
            // Place monsters into rooms
            (zone.monsters||[]).forEach(mob=>{
              const mobKey=(mob.name||'creature').toLowerCase().replace(/[^a-z0-9]+/g,'_');
              (mob.rooms||[]).forEach(rid=>{
                if(newRooms[rid]){
                  const m=M(mobKey+'_'+Date.now(),mob.name,mob.hp||20,mob.atk||5,mob.def||3,mob.xp||20,mob.gold||5,null,5);
                  newRooms[rid].monsters.push(m);
                }
              });
            });
            // Register items into EQ and place them in their rooms
            (zone.items||[]).forEach(item=>{
              if(!item.name)return;
              const k=item.name.toLowerCase();
              EQ[k]={t:item.type||'item',atk:item.atk||0,def:item.def||0,desc:item.desc||'',_dynamic:true};
              _ezData.items=_ezData.items||{};
              _ezData.items[k]={t:item.type||'item',atk:item.atk||0,def:item.def||0,desc:item.desc||''};
              // Place item in specified room so players can find it
              if(item.foundIn&&newRooms[item.foundIn]){
                newRooms[item.foundIn].items.push(item.name);
              }
            });
            // Merge into live world
            Object.assign(world,newRooms);
            tile.explore=zone.rooms[0].id;
            // Persist
            _ezData.tiles[tileId]=zone.rooms[0].id;
            Object.assign(_ezData.rooms,newRooms);
            saveExploreZones();
            raw(ws,{type:'explore_zone_saved',tileId,zoneName:zone.zoneName,entryRoomId:zone.rooms[0].id,roomCount:(zone.rooms||[]).length});
            say(ws,`✦ Explore zone "${zone.zoneName}" is now live on ${tile.name}! (${(zone.rooms||[]).length} rooms)`,'ok');
            console.log('[ExploreZone] Created:',zone.zoneName,'on',tileId,'—',(zone.rooms||[]).length,'rooms');
          }else if(action.type==='admin_teleport'){
            if(!p.isAdmin)return say(ws,'Not authorized.','err');
            const dest=action.roomId;
            if(!world[dest])return say(ws,`Room not found: ${dest}`,'err');
            if(dest===p.room)return;
            p.room=dest;p.inCombat=false;p.enemy=null;
            say(ws,`✦ [Admin] Teleported to ${world[dest].name}.`,'sys');
            describeRoom(ws,p);sidebar(ws,p);svc(p);
            console.log('[Admin Teleport]',p.name,'→',dest);
          }else if(action.type==='pvp_result'){
            const _pvpG=_pvpArcadeGames.get(p.username);
            if(_pvpG){
              _pvpArcadeGames.delete(p.username);
              const{higherPlayer,lowerPlayer}=_pvpG;
              if(action.win){
                pvpResult(lowerPlayer.ws,lowerPlayer,higherPlayer);
              }else{
                pvpResult(higherPlayer.ws,higherPlayer,lowerPlayer);
              }
            }
          }else if(action.type==='world_map_request'){
            // Build full world layout from town_square — no depth limit
            const fullMap = buildFullMapData(p);
            raw(ws,{type:'world_map', rooms:fullMap});
          }else if(action.type==='leaderboard_request'){
            sendLeaderboardData(ws,action.cat||'level');
          }else if(action.type==='theater_signal'){
            // WebRTC signaling relay for cinema screen share
            const{signal,target,signalType}=action;
            if(signalType==='broadcast_start'){
              _theaterBroadcaster={username:p.username,ws};
              // Notify all in theater room
              for(const[tw,tp] of sessions){if(tp.room==='arcade_theater'&&tp.username!==p.username&&tw.readyState===WS.OPEN)tw.send(JSON.stringify({type:'theater_viewer_join',broadcaster:p.name}));}
              say(ws,'📡 Screen share started. Others in the cinema can now see your screen.','ok');
            }else if(signalType==='broadcast_stop'){
              _theaterBroadcaster=null;
              for(const[tw,tp] of sessions){if(tp.room==='arcade_theater'&&tp.username!==p.username&&tw.readyState===WS.OPEN)tw.send(JSON.stringify({type:'theater_stream_ended'}));}
              say(ws,'Screen share ended.','sys');
            }else if(signalType==='offer'||signalType==='answer'||signalType==='ice'){
              // Route signal to target user
              for(const[tw,tp] of sessions){if(tp.username===target&&tw.readyState===WS.OPEN){tw.send(JSON.stringify({type:'theater_signal',signalType,signal,from:p.username}));break;}}
            }else if(signalType==='viewer_request'){
              // Viewer asking broadcaster for an offer
              if(_theaterBroadcaster&&_theaterBroadcaster.ws.readyState===WS.OPEN){
                _theaterBroadcaster.ws.send(JSON.stringify({type:'theater_signal',signalType:'new_viewer',from:p.username}));
              }
            }
          }else if(action.type==='poker_act'){
            _ptPlayerAct(ws,p,action.act,parseInt(action.amount)||0);
          }else if(action.type==='poker_leave'){
            _ptLeave(ws,p);
          }else if(action.type==='game_result'){
            const betAmt=Math.max(0,parseInt(action.bet)||0);
            if(action.cancel){
              // Game never started (coming-soon) — full refund
              if(betAmt>0){p.gold+=betAmt;sidebar(ws,p);}
              say(ws,`Game not yet available — your ${betAmt}g has been refunded.`,'sys');
            }else if(action.win){
              if(p._activeGame==='kaboom'){
                p.gold+=betAmt;
                p.inventory=p.inventory||[];
                p.inventory.push('iron pickaxe');
                sidebar(ws,p);
                say(ws,`🏆 You win! Crag nods and slides a sturdy iron pickaxe across the table. Your ${betAmt}g bet returned.`,'loot');
              }else{
                const winnings=Math.floor(betAmt*1.25);
                p.gold+=winnings;
                sidebar(ws,p);
                say(ws,`🏆 You win! You collect ${winnings}g — your ${betAmt}g bet returned plus ${winnings-betAmt}g winnings.`,'loot');
              }
            }else{
              say(ws,`You lose. ${betAmt}g slips into your opponent's pocket.`,'err');
            }
            p._activeGame=null;
            svc(p);
          }else if(action.type==='logout'){
            if(p&&p.loggedIn){svc(p);console.log('[Logout]',p.name);}
            ws.close();
            return;
          }
        }catch(je){console.error('[JSON MSG]',je.message);}
        return;
      }
      handleCmd(ws,p,raw2);
      // Only save if fully logged in player with username
      if(p.loggedIn&&p.username)svc(p);
    }catch(e){
      console.error('[MSG ERROR]',e.message,e.stack);
      try{say(ws,'An error occurred. Please try again.','err');}catch{}
    }
  });
  ws.on('close',()=>{
    const p=sessions.get(ws);
    if(p&&p.loggedIn){
      // Auto-leave poker table on disconnect
      if(_pt&&_pt.seats.find(s=>s.username===p.username)){
        _ptLeave(ws,p,'You disconnected — your chips have been cashed out.');
      }
      svc(p);bAll({type:'line',text:`${p.name} has left James Village.`,cls:'narrate'});console.log('[DC]',p.name);
    }
    sessions.delete(ws);
  });
  ws.on('error',e=>console.error('[WS]',e.message));
});

// Initialize day/night after everything is loaded
updateDayNight();
applyNightMonsters();
console.log('[Boot] Day/night initialized — time:',TIMES[gameHour],'weather:',weather);

server.listen(PORT,'0.0.0.0',()=>{
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║   SHADOWMERE MUD v10 — RUNNING                   ║');
  console.log(`  ║   OpenAI: ${process.env.OPENAI_API_KEY?'✓ configured':'✗ NOT SET    '}  Grok: ${process.env.XAI_API_KEY?'✓ configured':'✗ NOT SET'}  ║`);
  console.log(`  ║   http://localhost:${PORT}                             ║`);
  console.log('  ║   20 Classes · 15 Races · 8 Adventure Zones      ║');
  console.log('  ║   Guilds · Quests · AI NPCs · Admin Panel        ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
});

