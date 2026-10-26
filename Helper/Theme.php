<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Helper;

use Magento\Framework\View\DesignInterface;
use OOCS\LynxComponent\Helper\ThemeIdentity;

/**
 * Whether the theme this request runs is a Lynx one
 */
class Theme
{
    /** Kept for callers that match theme codes themselves; the rule owns the value. */
    public const THEME_CODE = ThemeIdentity::THEME_CODE;

    /**
     * @var array<string, bool> keyed by theme id: cron emulation switches themes within one process
     */
    private array $isLynxTheme = [];

    /**
     * Design, theme identity
     *
     * @param DesignInterface $design
     * @param ThemeIdentity $themeIdentity
     */
    public function __construct(
        private readonly DesignInterface $design,
        private readonly ThemeIdentity $themeIdentity,
    ) {
    }

    /**
     * The current design theme or one of its parents is Lynx
     *
     * @return bool
     */
    public function isLynxTheme(): bool
    {
        $theme = $this->design->getDesignTheme();

        return $this->isLynxTheme[(string) $theme->getId()] ??= $this->themeIdentity->isLynx($theme);
    }
}
