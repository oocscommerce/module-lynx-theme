<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Helper;

/**
 * Whether an email template is being rendered: its design emulation is the one the email theme applies to
 */
class EmailDesign
{
    /**
     * Templates open: an email renders child templates inside its own
     *
     * @var int
     */
    private int $depth = 0;

    /**
     * An email template starts rendering
     *
     * @return void
     */
    public function enter(): void
    {
        $this->depth++;
    }

    /**
     * An email template is done
     *
     * @return void
     */
    public function leave(): void
    {
        $this->depth = max(0, $this->depth - 1);
    }

    /**
     * Is Active
     *
     * @return bool
     */
    public function isActive(): bool
    {
        return $this->depth > 0;
    }
}
