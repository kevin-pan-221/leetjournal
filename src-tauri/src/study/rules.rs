//! A Minecraft-inspired hidden roll, not a version-exact simulation of its game code.
//! Names, maximum ranks and incompatibilities are real equipment enchantments.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Enchantment {
    pub name: String,
    pub level: u8,
}

struct Definition {
    name: &'static str,
    max: u8,
    weight: u32,
    slots: &'static [&'static str],
    conflict: &'static str,
}

const ARMOR: &[&str] = &["helmet", "chestplate", "leggings", "boots"];
const ALL: &[&str] = &[
    "helmet",
    "chestplate",
    "leggings",
    "boots",
    "sword",
    "pickaxe",
];
const CATALOG: &[Definition] = &[
    Definition {
        name: "Protection",
        max: 4,
        weight: 10,
        slots: ARMOR,
        conflict: "protection",
    },
    Definition {
        name: "Fire Protection",
        max: 4,
        weight: 5,
        slots: ARMOR,
        conflict: "protection",
    },
    Definition {
        name: "Blast Protection",
        max: 4,
        weight: 2,
        slots: ARMOR,
        conflict: "protection",
    },
    Definition {
        name: "Projectile Protection",
        max: 4,
        weight: 5,
        slots: ARMOR,
        conflict: "protection",
    },
    Definition {
        name: "Unbreaking",
        max: 3,
        weight: 5,
        slots: ALL,
        conflict: "",
    },
    Definition {
        name: "Respiration",
        max: 3,
        weight: 2,
        slots: &["helmet"],
        conflict: "",
    },
    Definition {
        name: "Aqua Affinity",
        max: 1,
        weight: 2,
        slots: &["helmet"],
        conflict: "",
    },
    Definition {
        name: "Thorns",
        max: 3,
        weight: 1,
        slots: &["chestplate"],
        conflict: "",
    },
    Definition {
        name: "Feather Falling",
        max: 4,
        weight: 5,
        slots: &["boots"],
        conflict: "",
    },
    Definition {
        name: "Depth Strider",
        max: 3,
        weight: 2,
        slots: &["boots"],
        conflict: "",
    },
    Definition {
        name: "Sharpness",
        max: 5,
        weight: 10,
        slots: &["sword"],
        conflict: "damage",
    },
    Definition {
        name: "Smite",
        max: 5,
        weight: 5,
        slots: &["sword"],
        conflict: "damage",
    },
    Definition {
        name: "Bane of Arthropods",
        max: 5,
        weight: 5,
        slots: &["sword"],
        conflict: "damage",
    },
    Definition {
        name: "Knockback",
        max: 2,
        weight: 5,
        slots: &["sword"],
        conflict: "",
    },
    Definition {
        name: "Fire Aspect",
        max: 2,
        weight: 2,
        slots: &["sword"],
        conflict: "",
    },
    Definition {
        name: "Looting",
        max: 3,
        weight: 2,
        slots: &["sword"],
        conflict: "",
    },
    Definition {
        name: "Efficiency",
        max: 5,
        weight: 10,
        slots: &["pickaxe"],
        conflict: "",
    },
    Definition {
        name: "Fortune",
        max: 3,
        weight: 2,
        slots: &["pickaxe"],
        conflict: "mining",
    },
    Definition {
        name: "Silk Touch",
        max: 1,
        weight: 1,
        slots: &["pickaxe"],
        conflict: "mining",
    },
];

pub fn random(seed: &mut u64) -> u32 {
    // Persisted, deterministic PRNG: refreshing or retrying cannot reroll offers.
    *seed = seed.wrapping_add(0x9e3779b97f4a7c15);
    let mut z = *seed;
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
    (z ^ (z >> 31)) as u32
}

pub fn requirements(seed: u64, shelves: u32) -> [u32; 3] {
    let shelves = shelves.min(15);
    let mut rng = seed;
    let base = 1 + random(&mut rng) % 8 + shelves / 2 + random(&mut rng) % (shelves + 1);
    [
        (base / 3).max(1),
        (base * 2 / 3 + 1).max(2),
        base.max(shelves * 2).max(3),
    ]
}

pub fn roll(seed: u64, kind: &str, material: &str, power: u32) -> Vec<Enchantment> {
    let mut rng = seed;
    let material_bonus = match material {
        "leather" => 5,
        "iron" => 3,
        _ => 2,
    };
    let strength = power + random(&mut rng) % (material_bonus + 1);
    let count = 1
        + u32::from(random(&mut rng) % 40 < strength)
        + u32::from(strength >= 24 && random(&mut rng).is_multiple_of(3));
    let mut chosen: Vec<&Definition> = Vec::new();
    let mut result = Vec::new();
    for _ in 0..count {
        let eligible: Vec<_> = CATALOG
            .iter()
            .filter(|d| {
                d.slots.contains(&kind)
                    && !chosen.iter().any(|c| {
                        c.name == d.name || (!d.conflict.is_empty() && c.conflict == d.conflict)
                    })
            })
            .collect();
        let total: u32 = eligible.iter().map(|d| d.weight).sum();
        if total == 0 {
            break;
        }
        let mut pick = random(&mut rng) % total;
        let definition = eligible
            .into_iter()
            .find(|d| {
                if pick < d.weight {
                    true
                } else {
                    pick -= d.weight;
                    false
                }
            })
            .expect("weighted selection has an eligible entry");
        let ceiling =
            (1 + strength * u32::from(definition.max - 1) / 30).min(u32::from(definition.max));
        let level = ceiling
            .saturating_sub(u32::from(ceiling > 1 && random(&mut rng).is_multiple_of(4)))
            .max(1);
        result.push(Enchantment {
            name: definition.name.into(),
            level: level as u8,
        });
        chosen.push(definition);
    }
    result
}

pub fn xp_at(level: u32) -> i64 {
    let l = i64::from(level);
    if level <= 16 {
        l * l + 6 * l
    } else if level <= 31 {
        (5 * l * l - 81 * l + 720) / 2
    } else {
        (9 * l * l - 325 * l + 4440) / 2
    }
}
pub fn level_at(xp: i64) -> u32 {
    let mut low: u32 = 0;
    let mut high: u32 = 1_000_000;
    while low < high {
        let mid = low + (high - low).div_ceil(2);
        if xp_at(mid) <= xp {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    low
}
pub fn spend_levels(xp: i64, cost: u32) -> i64 {
    let level = level_at(xp);
    let target = level.saturating_sub(cost);
    let progress = xp - xp_at(level);
    xp_at(target)
        + progress * (xp_at(target + 1) - xp_at(target)) / (xp_at(level + 1) - xp_at(level))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn levels_and_payment_preserve_progress_without_spending_requirement() {
        assert_eq!(xp_at(30), 1395);
        for level in 0..80 {
            assert_eq!(level_at(xp_at(level)), level);
        }
        assert_eq!(level_at(spend_levels(1400, 3)), 27);
        assert_eq!(requirements(15, 15)[2], 30);
    }
    #[test]
    fn rolls_obey_slots_maxima_conflicts_and_are_repeatable() {
        for kind in ALL {
            for seed in 0..500 {
                let result = roll(seed, kind, "diamond", 30);
                assert_eq!(result, roll(seed, kind, "diamond", 30));
                assert!(!result.is_empty());
                let mut groups = std::collections::HashSet::new();
                for enchant in result {
                    let d = CATALOG.iter().find(|d| d.name == enchant.name).unwrap();
                    assert!(d.slots.contains(kind));
                    assert!((1..=d.max).contains(&enchant.level));
                    assert!(d.conflict.is_empty() || groups.insert(d.conflict));
                }
            }
        }
    }
}
