#![allow(dead_code)]

use crate::points::PointState;
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionState {
    pub video_id: Option<String>,
    pub points: PointState,
}

impl SessionState {
    fn state_path() -> Option<PathBuf> {
        ProjectDirs::from("com", "ytpoint", "yt-point")
            .map(|dirs| dirs.data_dir().join("session.json"))
    }

    pub fn load() -> Self {
        let Some(path) = Self::state_path() else {
            return Self::default();
        };

        if !path.exists() {
            return Self::default();
        }

        fs::read_to_string(&path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default()
    }

    pub fn save(&self) -> Result<(), Box<dyn std::error::Error>> {
        let path = Self::state_path().ok_or("Could not determine state path")?;

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let content = serde_json::to_string_pretty(self)?;
        fs::write(&path, content)?;
        Ok(())
    }

    pub fn clear() -> Result<(), Box<dyn std::error::Error>> {
        let path = Self::state_path().ok_or("Could not determine state path")?;
        if path.exists() {
            fs::remove_file(&path)?;
        }
        Ok(())
    }
}
